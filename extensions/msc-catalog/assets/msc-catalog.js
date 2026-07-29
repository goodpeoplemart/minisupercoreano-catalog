(() => {
  "use strict";

  const ready = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  ready(() => {
    document.querySelectorAll("[data-msc-root]").forEach((root) => {
      if (root.dataset.mscInitialized === "true") return;
      root.dataset.mscInitialized = "true";
      initCatalog(root);
    });
  });

  function initCatalog(root) {
    const productsUrl = root.dataset.productsUrl || "/apps/msc/products";
    const requestUrl = root.dataset.requestUrl || "/apps/msc/request";
    const clickUrl = root.dataset.clickUrl || "/apps/msc/click";
    const currency = root.dataset.currency || "MXN";
    const whatsappNumber = String(root.dataset.whatsapp || "").replace(/\D/g, "");

    const el = {
      status: root.querySelector("[data-msc-status]"),
      grid: root.querySelector("[data-msc-products-grid]"),
      openCart: root.querySelector("[data-msc-open-cart]"),
      cartDrawer: root.querySelector("[data-msc-cart-drawer]"),
      closeCart: root.querySelectorAll("[data-msc-close-cart]"),
      cartCount: root.querySelector("[data-msc-cart-count]"),
      cartItems: root.querySelector("[data-msc-cart-items]"),
      cartEmpty: root.querySelector("[data-msc-cart-empty]"),
      cartTotal: root.querySelector("[data-msc-cart-total]"),
      openCheckout: root.querySelector("[data-msc-open-checkout]"),
      productModal: root.querySelector("[data-msc-product-modal]"),
      closeProduct: root.querySelectorAll("[data-msc-close-product]"),
      modalImage: root.querySelector("[data-msc-modal-image]"),
      modalPlaceholder: root.querySelector("[data-msc-modal-placeholder]"),
      modalTitle: root.querySelector("[data-msc-modal-title]"),
      modalPrice: root.querySelector("[data-msc-modal-price]"),
      modalDescription: root.querySelector("[data-msc-modal-description]"),
      modalQuantity: root.querySelector("[data-msc-modal-quantity]"),
      modalMinus: root.querySelector("[data-msc-modal-minus]"),
      modalPlus: root.querySelector("[data-msc-modal-plus]"),
      addCart: root.querySelector("[data-msc-add-cart]"),
      checkoutModal: root.querySelector("[data-msc-checkout-modal]"),
      checkoutInner: root.querySelector(".msc-checkout-inner"),
      closeCheckout: root.querySelectorAll("[data-msc-close-checkout]"),
      checkoutForm: root.querySelector("[data-msc-checkout-form]"),
      checkoutItems: root.querySelector("[data-msc-checkout-items]"),
      checkoutTotal: root.querySelector("[data-msc-checkout-total]"),
      submit: root.querySelector("[data-msc-submit]"),
      message: root.querySelector("[data-msc-message]")
    };

    const state = {
      products: [],
      cart: [],
      selectedProduct: null,
      selectedQuantity: 1
    };

    bindEvents();
    loadProducts();

    function bindEvents() {
      el.openCart?.addEventListener("click", openCart);
      el.closeCart.forEach((button) => button.addEventListener("click", closeCart));
      el.closeProduct.forEach((button) => button.addEventListener("click", closeProduct));
      el.closeCheckout.forEach((button) => button.addEventListener("click", closeCheckout));

      el.modalMinus?.addEventListener("click", () => {
        state.selectedQuantity = Math.max(1, state.selectedQuantity - 1);
        updateModalQuantity();
      });

      el.modalPlus?.addEventListener("click", () => {
        state.selectedQuantity += 1;
        updateModalQuantity();
      });

      el.addCart?.addEventListener("click", () => {
        if (!state.selectedProduct) return;

        addToCart(state.selectedProduct, state.selectedQuantity);
        closeProduct();

        requestAnimationFrame(() => {
          root.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      el.openCheckout?.addEventListener("click", () => {
        if (!state.cart.length) return;

        closeCart();
        renderCheckout();

        if (el.checkoutInner) {
          el.checkoutInner.scrollTop = 0;
        }

        showLayer(el.checkoutModal);

        requestAnimationFrame(() => {
          if (el.checkoutInner) {
            el.checkoutInner.scrollTop = 0;
          }

          const firstField = el.checkoutForm?.querySelector('input[name="name"]');
          firstField?.focus({ preventScroll: true });
        });
      });

      el.checkoutForm?.addEventListener("submit", submitOrder);

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeProduct();
        closeCart();
        closeCheckout();
      });
    }

    async function loadProducts() {
      setStatus("Cargando productos...", false);

      try {
        const response = await fetch(productsUrl, {
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        });

        const rawText = await response.text();
        let payload = {};

        try {
          payload = rawText ? JSON.parse(rawText) : {};
        } catch {
          throw new Error("La respuesta del servidor no es JSON válido.");
        }

        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
        }

        state.products = extractProducts(payload)
          .map(normalizeProduct)
          .filter((product) => product.id && product.title);

        if (!state.products.length) {
          setStatus("No hay productos publicados disponibles.", false);
          console.warn("MSC products payload:", payload);
          return;
        }

        hideStatus();
        renderProducts();
      } catch (error) {
        console.error("MSC product loading error:", error);
        setStatus(`No se pudieron cargar los productos. ${error.message}`, true);
      }
    }

    function extractProducts(payload) {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.products)) return payload.products;
      if (Array.isArray(payload?.data)) return payload.data;
      if (Array.isArray(payload?.data?.products)) return payload.data.products;
      if (Array.isArray(payload?.products?.nodes)) return payload.products.nodes;
      if (Array.isArray(payload?.data?.products?.nodes)) return payload.data.products.nodes;
      if (Array.isArray(payload?.products?.edges)) return payload.products.edges.map((e) => e.node);
      if (Array.isArray(payload?.data?.products?.edges)) return payload.data.products.edges.map((e) => e.node);
      return [];
    }

    function getNodes(value) {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.nodes)) return value.nodes;
      if (Array.isArray(value?.edges)) return value.edges.map((e) => e.node);
      return [];
    }

    function normalizeProduct(raw, index) {
      const variants = getNodes(raw?.variants);
      const images = getNodes(raw?.images);
      const firstVariant = variants[0] || raw?.variant || raw?.selectedOrFirstAvailableVariant || {};
      const featuredImage = raw?.featuredImage || raw?.featured_image || raw?.image || images[0] || {};

      const priceCandidate =
        raw?.price ??
        raw?.priceAmount ??
        raw?.price_amount ??
        raw?.priceRange?.minVariantPrice?.amount ??
        raw?.price_range?.min_variant_price?.amount ??
        firstVariant?.price?.amount ??
        firstVariant?.price ??
        firstVariant?.priceV2?.amount ??
        0;

      const imageUrl =
        (typeof featuredImage === "string" ? featuredImage : "") ||
        featuredImage?.url ||
        featuredImage?.src ||
        featuredImage?.originalSrc ||
        featuredImage?.transformedSrc ||
        featuredImage?.original_src ||
        raw?.imageUrl ||
        raw?.image_url ||
        raw?.featuredImageUrl ||
        raw?.featured_image_url ||
        (typeof raw?.image === "string" ? raw.image : "") ||
        (typeof raw?.featured_image === "string" ? raw.featured_image : "") ||
        firstVariant?.image?.url ||
        firstVariant?.image?.src ||
        "";

      return {
        id: String(raw?.id || raw?.productId || raw?.product_id || raw?.handle || index + 1),
        variantId: String(firstVariant?.id || raw?.variantId || raw?.variant_id || ""),
        title: String(raw?.title || raw?.name || raw?.productTitle || "").trim(),
        description: stripHtml(raw?.descriptionHtml || raw?.description_html || raw?.body_html || raw?.description || ""),
        image: normalizeImageUrl(imageUrl),
        imageAlt: featuredImage?.altText || featuredImage?.alt || raw?.title || "",
        price: parseMoney(priceCandidate),
        handle: raw?.handle || "",
        available:
          raw?.availableForSale ??
          raw?.available_for_sale ??
          firstVariant?.availableForSale ??
          firstVariant?.available ??
          true
      };
    }

    function normalizeImageUrl(value) {
      const url = String(value || "").trim();
      if (!url) return "";
      return url.startsWith("//") ? `https:${url}` : url;
    }

    function parseMoney(value) {
      if (value && typeof value === "object") value = value.amount ?? value.value ?? 0;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function renderProducts() {
      el.grid.innerHTML = "";
      const fragment = document.createDocumentFragment();

      state.products.forEach((product) => {
        const card = document.createElement("article");
        card.className = "msc-product-card";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "msc-product-button";
        button.setAttribute("aria-label", `Ver ${product.title}`);

        const media = document.createElement("div");
        media.className = "msc-product-media";

        if (product.image) {
          const image = document.createElement("img");
          image.className = "msc-product-image";
          image.src = product.image;
          image.alt = product.imageAlt || product.title;
          image.loading = "lazy";
          image.width = 500;
          image.height = 500;
          image.addEventListener("error", () => {
            image.remove();
            const placeholder = document.createElement("span");
            placeholder.className = "msc-product-placeholder";
            placeholder.textContent = "Sin imagen";
            media.appendChild(placeholder);
          }, { once: true });
          media.appendChild(image);
        } else {
          const placeholder = document.createElement("span");
          placeholder.className = "msc-product-placeholder";
          placeholder.textContent = "Sin imagen";
          media.appendChild(placeholder);
        }

        const info = document.createElement("div");
        info.className = "msc-product-info";

        const title = document.createElement("h3");
        title.className = "msc-product-name";
        title.textContent = product.title;

        const price = document.createElement("div");
        price.className = "msc-product-price";
        price.textContent = formatMoney(product.price);

        info.append(title, price);
        button.append(media, info);
        card.appendChild(button);

        button.addEventListener("click", () => {
          openProduct(product);
          sendClick(product).catch(() => {});
        });

        fragment.appendChild(card);
      });

      el.grid.appendChild(fragment);
    }

    function openProduct(product) {
      state.selectedProduct = product;
      state.selectedQuantity = 1;
      el.modalTitle.textContent = product.title;
      el.modalPrice.textContent = formatMoney(product.price);
      el.modalDescription.textContent = product.description || "";

      if (product.image) {
        el.modalImage.src = product.image;
        el.modalImage.alt = product.imageAlt || product.title;
        el.modalImage.hidden = false;
        el.modalPlaceholder.hidden = true;
        el.modalImage.onerror = () => {
          el.modalImage.hidden = true;
          el.modalPlaceholder.hidden = false;
        };
      } else {
        el.modalImage.removeAttribute("src");
        el.modalImage.alt = "";
        el.modalImage.hidden = true;
        el.modalPlaceholder.hidden = false;
      }

      el.addCart.disabled = !product.available;
      el.addCart.textContent = product.available ? "Agregar a la lista" : "Producto no disponible";
      updateModalQuantity();
      showLayer(el.productModal);
    }

    function closeProduct() {
      hideLayer(el.productModal);
      state.selectedProduct = null;
      state.selectedQuantity = 1;
    }

    function updateModalQuantity() {
      if (el.modalQuantity) el.modalQuantity.textContent = String(state.selectedQuantity);
    }

    function addToCart(product, quantity) {
      const existing = state.cart.find((item) => item.product.id === product.id);
      if (existing) existing.quantity += quantity;
      else state.cart.push({ product, quantity });
      renderCart();
    }

    function renderCart() {
      el.cartItems.innerHTML = "";
      const totalQuantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = state.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

      el.cartCount.textContent = String(totalQuantity);
      el.cartTotal.textContent = formatMoney(totalPrice);
      el.openCheckout.disabled = state.cart.length === 0;

      if (!state.cart.length) {
        el.cartEmpty.hidden = false;
        return;
      }

      el.cartEmpty.hidden = true;

      state.cart.forEach((item) => {
        const row = document.createElement("article");
        row.className = "msc-cart-item";

        if (item.product.image) {
          const image = document.createElement("img");
          image.className = "msc-cart-item-image";
          image.src = item.product.image;
          image.alt = item.product.imageAlt || item.product.title;
          image.loading = "lazy";
          image.width = 100;
          image.height = 100;
          row.appendChild(image);
        } else {
          const placeholder = document.createElement("div");
          placeholder.className = "msc-cart-item-image";
          row.appendChild(placeholder);
        }

        const content = document.createElement("div");
        content.className = "msc-cart-item-content";

        const name = document.createElement("h4");
        name.className = "msc-cart-item-name";
        name.textContent = item.product.title;

        const price = document.createElement("div");
        price.className = "msc-cart-item-price";
        price.textContent = `${formatMoney(item.product.price)} × ${item.quantity}`;

        const actions = document.createElement("div");
        actions.className = "msc-cart-item-actions";

        const quantity = document.createElement("div");
        quantity.className = "msc-cart-quantity";

        const minus = document.createElement("button");
        minus.type = "button";
        minus.textContent = "−";

        const value = document.createElement("span");
        value.textContent = String(item.quantity);

        const plus = document.createElement("button");
        plus.type = "button";
        plus.textContent = "+";

        minus.addEventListener("click", () => {
          item.quantity -= 1;
          if (item.quantity <= 0) state.cart = state.cart.filter((cartItem) => cartItem !== item);
          renderCart();
        });

        plus.addEventListener("click", () => {
          item.quantity += 1;
          renderCart();
        });

        quantity.append(minus, value, plus);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "msc-cart-remove";
        remove.textContent = "Eliminar";
        remove.addEventListener("click", () => {
          state.cart = state.cart.filter((cartItem) => cartItem !== item);
          renderCart();
        });

        actions.append(quantity, remove);
        content.append(name, price, actions);
        row.appendChild(content);
        el.cartItems.appendChild(row);
      });
    }

    function openCart() {
      renderCart();
      showLayer(el.cartDrawer);
    }

    function closeCart() {
      hideLayer(el.cartDrawer);
    }

    function renderCheckout() {
      el.checkoutItems.innerHTML = "";

      state.cart.forEach((item) => {
        const row = document.createElement("div");
        row.className = "msc-order-item";

        const label = document.createElement("span");
        label.textContent = `${item.product.title} × ${item.quantity}`;

        const amount = document.createElement("strong");
        amount.textContent = formatMoney(item.product.price * item.quantity);

        row.append(label, amount);
        el.checkoutItems.appendChild(row);
      });

      el.checkoutTotal.textContent = formatMoney(getCartTotal());
    }

    function closeCheckout() {
      hideLayer(el.checkoutModal);
      setMessage("");
    }

    async function submitOrder(event) {
      event.preventDefault();

      if (!state.cart.length) {
        setMessage("La lista está vacía.");
        return;
      }

      if (!el.checkoutForm.reportValidity()) return;

      const customer = Object.fromEntries(new FormData(el.checkoutForm).entries());
      const order = {
        customer,
        items: state.cart.map((item) => ({
          productId: item.product.id,
          variantId: item.product.variantId,
          title: item.product.title,
          price: item.product.price,
          quantity: item.quantity,
          total: item.product.price * item.quantity
        })),
        currency,
        total: getCartTotal()
      };

      setSubmitting(true);
      setMessage("");

      let responsePayload = null;

      try {
        const response = await fetch(requestUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(order)
        });

        const responseText = await response.text();
        if (responseText) {
          try { responsePayload = JSON.parse(responseText); } catch {}
        }
      } catch (error) {
        console.warn("MSC request endpoint unavailable:", error);
      }

      const returnedUrl =
        responsePayload?.whatsappUrl ||
        responsePayload?.whatsapp_url ||
        responsePayload?.url ||
        "";

      const whatsappUrl = returnedUrl || buildWhatsappUrl(order, whatsappNumber);

      if (!whatsappUrl) {
        setMessage("Configure el número de WhatsApp en el bloque MSC Catalog.");
        setSubmitting(false);
        return;
      }

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      setMessage("El pedido está listo para enviarse por WhatsApp.", true);
      setSubmitting(false);
    }

    function buildWhatsappUrl(order, phone) {
      if (!phone) return "";

      const c = order.customer;
      const address = [
        c.address,
        c.exteriorNumber ? `Ext. ${c.exteriorNumber}` : "",
        c.interiorNumber ? `Int. ${c.interiorNumber}` : "",
        c.colonia,
        c.municipality,
        c.state,
        c.postalCode ? `C.P. ${c.postalCode}` : ""
      ].filter(Boolean).join(", ");

      const lines = [
        "Hola, quiero realizar el siguiente pedido:",
        "",
        ...order.items.map((item) => `• ${item.title} × ${item.quantity} — ${formatMoney(item.total)}`),
        "",
        `Total: ${formatMoney(order.total)}`,
        "",
        "Datos del comprador:",
        `Nombre: ${c.name || ""}`,
        `Teléfono: ${c.phone || ""}`,
        `Dirección: ${address}`,
        c.email ? `Correo: ${c.email}` : "",
        c.deliveryTime ? `Horario: ${c.deliveryTime}` : "",
        c.reference ? `Referencias: ${c.reference}` : "",
        c.comments ? `Comentarios: ${c.comments}` : ""
      ].filter(Boolean);

      return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
    }

    async function sendClick(product) {
      if (!clickUrl) return;
      await fetch(clickUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          productId: product.id,
          variantId: product.variantId,
          handle: product.handle
        })
      });
    }

    function showLayer(element) {
      if (!element) return;
      element.hidden = false;
      element.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("msc-lock");
      document.body.classList.add("msc-lock");
    }

    function hideLayer(element) {
      if (!element || element.hidden) return;
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");

      const anyOpen = Array.from(
        document.querySelectorAll("[data-msc-product-modal], [data-msc-cart-drawer], [data-msc-checkout-modal]")
      ).some((layer) => !layer.hidden);

      if (!anyOpen) {
        document.documentElement.classList.remove("msc-lock");
        document.body.classList.remove("msc-lock");
      }
    }

    function getCartTotal() {
      return state.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    }

    function formatMoney(amount) {
      try {
        return new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      } catch {
        return `$${Number(amount || 0).toFixed(2)}`;
      }
    }

    function setStatus(message, isError) {
      el.status.hidden = false;
      el.status.textContent = message;
      el.status.classList.toggle("is-error", Boolean(isError));
    }

    function hideStatus() {
      el.status.hidden = true;
      el.status.textContent = "";
      el.status.classList.remove("is-error");
    }

    function setMessage(message, success = false) {
      if (!el.message) return;
      el.message.textContent = message;
      el.message.style.color = success ? "var(--msc-green)" : "";
    }

    function setSubmitting(value) {
      if (!el.submit) return;
      el.submit.disabled = value;
      el.submit.textContent = value ? "Preparando pedido..." : "Enviar pedido por WhatsApp";
    }
  }

  function stripHtml(value) {
    const node = document.createElement("div");
    node.innerHTML = String(value || "");
    return (node.textContent || node.innerText || "").trim();
  }
})();
