(() => {
  "use strict";

  /*
   * TABLE OF CONTENTS
   * - Initialization
   * - Configuration and DOM references
   * - Application state
   * - Event listeners
   * - API requests
   * - Product normalization
   * - Utility functions
   * - Product rendering
   * - Product modal
   * - Quantity controls
   * - Cart state
   * - Cart rendering
   * - Cart interactions
   * - Checkout rendering
   * - Order submission
   * - Click tracking
   * - Layer UI
   * - Loading and error handling
   */

  const ready = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  /* ==================================================
     INITIALIZATION
     ================================================== */
  ready(() => {
    document.querySelectorAll("[data-msc-root]").forEach((root) => {
      if (root.dataset.mscInitialized === "true") return;

      try {
        root.dataset.mscInitialized = "true";
        initCatalog(root);
      } catch (error) {
        console.error("[MSC catalog] initCatalog failed:", error);
        const status = root.querySelector("[data-msc-status]");
        if (status) {
          status.hidden = false;
          status.textContent = "No se pudieron cargar los productos.";
          status.classList.add("is-error");
        }
      }
    });
  });

  const DEFAULT_SELLER_WHATSAPP = "525633244119";
  const WHATSAPP_LABEL_BEFORE = "Enviar información por WhatsApp";
  const WHATSAPP_LABEL_AFTER = "Enviar pedido por WhatsApp";

  function safePrice(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  }

  function formatWhatsAppMoney(amount) {
    const value = safePrice(amount);

    try {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch {
      return `$${value.toFixed(2)}`;
    }
  }

  function buildBuyerStreet(buyer = {}) {
    return [
      buyer.address,
      buyer.exteriorNumber ? `No. ${buyer.exteriorNumber}` : "",
      buyer.interiorNumber ? `Int. ${buyer.interiorNumber}` : ""
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function buildWhatsAppOrderMessage(order) {
    if (!order) return "";

    const buyer = order.buyer || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const lines = ["Hola, quiero enviar la información de mi pedido.", ""];

    if (order.orderNumber) {
      lines.push(`Número de pedido: ${order.orderNumber}`, "");
    }

    lines.push(
      "Datos del comprador:",
      `Nombre: ${buyer.name || ""}`,
      `Teléfono: ${buyer.phone || ""}`,
      `Dirección: ${buyer.address || ""}`,
      `Número exterior: ${buyer.exteriorNumber || ""}`,
      `Número interior: ${buyer.interiorNumber || ""}`,
      `Código Postal: ${buyer.postalCode || ""}`,
      `Colonia: ${buyer.colonia || ""}`,
      `Alcaldía / Municipio: ${buyer.municipality || ""}`,
      `Estado: ${buyer.state || ""}`,
      `Correo electrónico: ${buyer.email || ""}`,
      `Referencias: ${buyer.reference || ""}`,
      "",
      "Productos:"
    );

    items.forEach((item) => {
      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
      const unitPrice = safePrice(item.unitPrice ?? item.price);
      const lineTotal = safePrice(item.lineTotal ?? item.subtotal ?? unitPrice * quantity);

      lines.push(
        `- ${item.title || "Producto"} × ${quantity} — ${formatWhatsAppMoney(lineTotal)}`
      );
    });

    lines.push("", `Total: ${formatWhatsAppMoney(order.total ?? order.subtotal)}`);

    return lines.join("\n");
  }

  function buildOrderSnapshot(formBuyer, cartItems, currencyCode) {
    const buyer = {
      name: String(formBuyer.name || "").trim(),
      phone: String(formBuyer.phone || "").trim(),
      email: String(formBuyer.email || "").trim(),
      address: String(formBuyer.address || "").trim(),
      exteriorNumber: String(formBuyer.exteriorNumber || "").trim(),
      interiorNumber: String(formBuyer.interiorNumber || "").trim(),
      postalCode: String(formBuyer.postalCode || "").trim(),
      colonia: String(formBuyer.colonia || "").trim(),
      municipality: String(formBuyer.municipality || "").trim(),
      state: String(formBuyer.state || "").trim(),
      reference: String(formBuyer.reference || "").trim(),
      comments: String(formBuyer.comments || "").trim()
    };

    buyer.street = buildBuyerStreet(buyer);

    const items = cartItems.map((entry) => {
      const unitPrice = safePrice(entry.product?.price);
      const quantity = Math.max(1, Number.parseInt(entry.quantity, 10) || 1);
      const lineTotal = unitPrice * quantity;

      return {
        productId: entry.product.id,
        variantId: entry.product.variantId,
        id: entry.product.id,
        title: entry.product.title || "Producto",
        quantity,
        unitPrice,
        price: unitPrice,
        lineTotal
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      buyer,
      items,
      subtotal,
      total: subtotal,
      currency: currencyCode
    };
  }

  function isCompletedOrderReady(order) {
    return Boolean(
      order?.orderNumber &&
        order?.buyer?.name &&
        Array.isArray(order.items) &&
        order.items.length > 0
    );
  }

  function initCatalog(root) {
    /* ==================================================
       CONFIGURATION AND DOM REFERENCES
       ================================================== */
    const productsUrl = root.dataset.productsUrl || "/apps/msc/products";
    const orderUrl =
      root.dataset.orderUrl ||
      root.dataset.requestUrl ||
      "/apps/msc/order";
    const clickUrl = root.dataset.clickUrl || "/apps/msc/click";
    const currency = root.dataset.currency || "MXN";
    const isDevCatalog =
      /localhost|127\.0\.0\.1/.test(window.location.hostname) ||
      root.dataset.devMode === "true";
    const sellerWhatsApp = String(root.dataset.sellerWhatsapp || DEFAULT_SELLER_WHATSAPP)
      .replace(/\D/g, "") || DEFAULT_SELLER_WHATSAPP;

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
      whatsappInfo: root.querySelector("[data-msc-whatsapp-info]"),
      message: root.querySelector("[data-msc-message]"),
      devWhatsAppTest: root.querySelector("[data-msc-dev-whatsapp-test]")
    };

    /* ==================================================
       APPLICATION STATE
       ================================================== */
    const state = {
      products: [],
      cart: [],
      selectedProduct: null,
      selectedQuantity: 1,
      completedOrder: null,
      isLoadingProducts: false
    };

    const cartStorageKey = `msc-catalog-cart:${root.id || "default"}`;

    function buildSellerWhatsAppUrl(message) {
      return `https://wa.me/${sellerWhatsApp}?text=${encodeURIComponent(message)}`;
    }

    function updateWhatsAppButton() {
      if (!el.whatsappInfo) return;

      const isReady = isCompletedOrderReady(state.completedOrder);
      el.whatsappInfo.textContent = isReady
        ? WHATSAPP_LABEL_AFTER
        : WHATSAPP_LABEL_BEFORE;
    }

    function openWhatsAppWithMessage(message) {
      const whatsappUrl = buildSellerWhatsAppUrl(message);

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }

    function buildWhatsAppMessageFromCheckout() {
      if (isCompletedOrderReady(state.completedOrder)) {
        return buildWhatsAppOrderMessage(state.completedOrder);
      }

      if (!state.cart.length) {
        return null;
      }

      const formBuyer = Object.fromEntries(new FormData(el.checkoutForm).entries());
      const orderSnapshot = buildOrderSnapshot(formBuyer, state.cart, currency);

      return buildWhatsAppOrderMessage(orderSnapshot);
    }

    function updateDevWhatsAppTestVisibility() {
      if (!el.devWhatsAppTest) return;

      el.devWhatsAppTest.hidden = !isDevCatalog;
    }

    function previewWhatsAppFromSnapshot(orderSnapshot) {
      const previewOrder = {
        ...orderSnapshot,
        orderNumber: "PREVIEW-TEST"
      };
      const whatsappMessage = buildWhatsAppOrderMessage(previewOrder);
      const whatsappUrl = buildSellerWhatsAppUrl(whatsappMessage);

      console.log("[WHATSAPP PREVIEW]", {
        itemCount: previewOrder.items.length,
        buyerName: previewOrder.buyer?.name,
        messageLength: whatsappMessage.length,
        url: whatsappUrl
      });

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }

    /* ==================================================
       POSTAL CODE INPUT (manual, Mexico 5 digits)
       ================================================== */
    const POSTAL_CODE_INVALID_MESSAGE =
      "Ingresa un Código Postal mexicano válido de 5 dígitos.";

    function normalizePostalCodeInput(value) {
      return String(value || "").replace(/\D/g, "").slice(0, 5);
    }

    function isValidMexicanPostalCode(value) {
      const normalized = normalizePostalCodeInput(value);
      return /^\d{5}$/.test(normalized) && normalized !== "00000";
    }

    function getPostalCodeInput() {
      return el.checkoutForm?.querySelector('input[name="postalCode"]') || null;
    }

    function bindPostalCodeInput() {
      const postalInput = getPostalCodeInput();
      if (!postalInput) return;

      postalInput.addEventListener("input", () => {
        const normalized = normalizePostalCodeInput(postalInput.value);

        if (postalInput.value !== normalized) {
          postalInput.value = normalized;
        }

        if (isValidMexicanPostalCode(postalInput.value)) {
          postalInput.setCustomValidity("");
        }
      });
    }

    function validatePostalCodeField() {
      const postalInput = getPostalCodeInput();
      if (!postalInput) return true;

      if (isValidMexicanPostalCode(postalInput.value)) {
        postalInput.setCustomValidity("");
        return true;
      }

      postalInput.setCustomValidity(POSTAL_CODE_INVALID_MESSAGE);
      postalInput.reportValidity();
      return false;
    }

    /* ==================================================
       EVENT LISTENERS
       ================================================== */
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
        state.completedOrder = null;
        renderCheckout();

        if (el.checkoutInner) {
          el.checkoutInner.scrollTop = 0;
        }

        showLayer(el.checkoutModal);
        updateWhatsAppButton();

        requestAnimationFrame(() => {
          if (el.checkoutInner) {
            el.checkoutInner.scrollTop = 0;
          }

          const firstField = el.checkoutForm?.querySelector('input[name="name"]');
          firstField?.focus({ preventScroll: true });
        });
      });

      el.checkoutForm?.addEventListener("submit", submitOrder);
      bindPostalCodeInput();

      el.whatsappInfo?.addEventListener("click", () => {
        if (isCompletedOrderReady(state.completedOrder)) {
          const whatsappMessage = buildWhatsAppOrderMessage(state.completedOrder);

          console.log("[WHATSAPP]", {
            orderNumber: state.completedOrder.orderNumber,
            itemCount: state.completedOrder.items.length,
            buyerName: state.completedOrder.buyer?.name,
            messageLength: whatsappMessage.length
          });

          openWhatsAppWithMessage(whatsappMessage);
          return;
        }

        if (!el.checkoutForm?.reportValidity()) {
          return;
        }

        if (!validatePostalCodeField()) {
          return;
        }

        const whatsappMessage = buildWhatsAppMessageFromCheckout();

        if (!whatsappMessage) {
          setMessage("La lista está vacía.");
          return;
        }

        openWhatsAppWithMessage(whatsappMessage);
      });

      updateWhatsAppButton();
      updateDevWhatsAppTestVisibility();

      el.devWhatsAppTest?.addEventListener("click", (event) => {
        event.preventDefault();

        if (!state.cart.length || !el.checkoutForm?.reportValidity()) {
          setMessage("Complete los datos del pedido para probar el mensaje.");
          return;
        }

        if (!validatePostalCodeField()) {
          return;
        }

        const formBuyer = Object.fromEntries(new FormData(el.checkoutForm).entries());
        const orderSnapshot = buildOrderSnapshot(formBuyer, state.cart, currency);

        if (isDevCatalog) {
          console.log("[ORDER DEBUG]", {
            buyer: orderSnapshot.buyer,
            cartItems: orderSnapshot.items,
            cartLength: orderSnapshot.items.length
          });
        }

        previewWhatsAppFromSnapshot(orderSnapshot);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeProduct();
        closeCart();
        closeCheckout();
      });
    }

    /* ==================================================
       API REQUESTS
       ================================================== */
    async function loadProducts() {
      state.isLoadingProducts = true;
      setStatus("Cargando productos...", false);

      try {
        if (!el.grid) {
          throw new Error("Product grid element not found.");
        }

        console.log("[MSC catalog] fetching products from", productsUrl);

        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId = controller
          ? setTimeout(() => controller.abort(), 30000)
          : null;

        let response;

        try {
          response = await fetch(productsUrl, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller?.signal
          });
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        const rawText = await response.text();
        let payload = null;

        console.log("[MSC catalog] products HTTP response", {
          url: productsUrl,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get("content-type") || "",
          bodyPreview: rawText.slice(0, 160)
        });

        if (rawText.trim().startsWith("<")) {
          throw new Error(
            `HTTP ${response.status}: HTML response (app proxy or session issue).`
          );
        }

        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch (parseError) {
          console.error("[MSC catalog] invalid JSON payload:", parseError, rawText);
          throw new Error(`HTTP ${response.status}: invalid JSON response.`);
        }

        if (!response.ok || payload?.ok === false) {
          console.error("[MSC catalog] products API error:", {
            status: response.status,
            payload
          });
          throw new Error(
            payload?.error ||
              payload?.message ||
              `HTTP ${response.status}`
          );
        }

        const extracted = extractProducts(payload);

        console.log("[MSC catalog] extracted products", {
          count: extracted.length,
          shape: Array.isArray(payload?.products)
            ? "payload.products"
            : payload?.data?.products
              ? "payload.data.products"
              : "unknown"
        });

        if (!extracted.length) {
          console.error("[MSC catalog] products array empty or missing:", payload);
          setStatus("No hay productos publicados disponibles.", false);
          return;
        }

        state.products = extracted
          .map(normalizeProduct)
          .filter((product) => product.id && product.title);

        if (!state.products.length) {
          console.warn("[MSC catalog] normalized product list empty:", payload);
          setStatus("No hay productos publicados disponibles.", false);
          return;
        }

        restoreCart();
        hideStatus();
        renderProducts();
        renderCart();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[MSC catalog] product loading failed:", {
          productsUrl,
          detail,
          error
        });
        setStatus("No se pudieron cargar los productos.", true);
      } finally {
        state.isLoadingProducts = false;
      }
    }

    /* ==================================================
       PRODUCT NORMALIZATION
       ================================================== */
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

      const compareAtCandidate =
        raw?.compareAtPrice ??
        raw?.compare_at_price ??
        firstVariant?.compareAtPrice ??
        firstVariant?.compare_at_price ??
        0;

      const promotionRaw = raw?.promotion;
      let promotionLabel = "";

      if (typeof promotionRaw === "string" && promotionRaw.trim() && promotionRaw !== "false") {
        promotionLabel = promotionRaw.trim();
      } else if (promotionRaw === true) {
        promotionLabel = "Promoción";
      }

      return {
        id: String(raw?.id || raw?.productId || raw?.product_id || raw?.handle || index + 1),
        variantId: String(firstVariant?.id || raw?.variantId || raw?.variant_id || ""),
        title: String(raw?.title || raw?.name || raw?.productTitle || "").trim(),
        description: stripHtml(raw?.descriptionHtml || raw?.description_html || raw?.body_html || raw?.description || ""),
        image: normalizeImageUrl(imageUrl),
        imageAlt: featuredImage?.altText || featuredImage?.alt || raw?.title || "",
        price: parseMoney(priceCandidate),
        compareAtPrice: parseMoney(compareAtCandidate),
        promotionLabel,
        handle: raw?.handle || "",
        available:
          raw?.availableForSale ??
          raw?.available_for_sale ??
          firstVariant?.availableForSale ??
          firstVariant?.available ??
          true
      };
    }

    /* ==================================================
       UTILITY FUNCTIONS
       ================================================== */
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

    /* ==================================================
       PRODUCT RENDERING
       ================================================== */
    function renderProducts() {
      if (!el.grid) return;

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

        if (product.promotionLabel) {
          const badge = document.createElement("span");
          badge.className = "msc-product-badge";
          badge.textContent = product.promotionLabel;
          media.appendChild(badge);
        }

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

        const prices = document.createElement("div");
        prices.className = "msc-product-prices";

        if (product.compareAtPrice > product.price) {
          const comparePrice = document.createElement("span");
          comparePrice.className = "msc-product-compare-price";
          comparePrice.textContent = formatCardPrice(product.compareAtPrice);
          prices.appendChild(comparePrice);
        }

        const price = document.createElement("span");
        price.className = "msc-product-price";
        price.textContent = formatCardPrice(product.price);
        prices.appendChild(price);

        info.append(title, prices);
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

    /* ==================================================
       PRODUCT MODAL
       ================================================== */
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

    /* ==================================================
       QUANTITY CONTROLS
       ================================================== */
    function updateModalQuantity() {
      if (el.modalQuantity) el.modalQuantity.textContent = String(state.selectedQuantity);
    }

    /* ==================================================
       CART STATE
       ================================================== */
    function invalidateStoredCart() {
      try {
        localStorage.removeItem(cartStorageKey);
      } catch (error) {
        console.warn("MSC cart storage remove failed:", error);
      }
    }

    function saveCart() {
      try {
        const payload = {
          version: 1,
          items: state.cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity
          }))
        };
        localStorage.setItem(cartStorageKey, JSON.stringify(payload));
      } catch (error) {
        console.warn("MSC cart storage save failed:", error);
      }
    }

    function restoreCart() {
      let raw = null;

      try {
        raw = localStorage.getItem(cartStorageKey);
      } catch (error) {
        console.warn("MSC cart storage read failed:", error);
        return;
      }

      if (!raw) return;

      let parsed = null;

      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        console.warn("MSC cart storage parse failed:", error);
        state.cart = [];
        invalidateStoredCart();
        return;
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        parsed.version !== 1 ||
        !Array.isArray(parsed.items)
      ) {
        state.cart = [];
        invalidateStoredCart();
        return;
      }

      const productById = new Map(state.products.map((product) => [product.id, product]));
      const restored = [];

      parsed.items.forEach((item) => {
        const productId = String(item?.productId ?? "").trim();
        if (!productId) return;

        const quantityValue = item?.quantity;
        if (typeof quantityValue !== "number" || !Number.isFinite(quantityValue)) return;

        const quantity = Math.floor(quantityValue);
        if (quantity <= 0) return;

        const currentProduct = productById.get(productId);
        if (!currentProduct) return;

        const existing = restored.find((entry) => entry.product.id === productId);
        if (existing) existing.quantity += quantity;
        else restored.push({ product: currentProduct, quantity });
      });

      state.cart = restored;
    }

    function addToCart(product, quantity) {
      const existing = state.cart.find((item) => item.product.id === product.id);
      if (existing) existing.quantity += quantity;
      else state.cart.push({ product, quantity });
      renderCart();
    }

    /* ==================================================
       CART RENDERING
       ================================================== */
    function renderCart() {
      el.cartItems.innerHTML = "";
      const totalQuantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = state.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

      el.cartCount.textContent = String(totalQuantity);
      el.cartTotal.textContent = formatMoney(totalPrice);
      el.openCheckout.disabled = state.cart.length === 0;

      if (!state.cart.length) {
        el.cartEmpty.hidden = false;
        saveCart();
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

      saveCart();
    }

    /* ==================================================
       CART INTERACTIONS
       ================================================== */
    function openCart() {
      renderCart();
      showLayer(el.cartDrawer);
    }

    function closeCart() {
      hideLayer(el.cartDrawer);
    }

    /* ==================================================
       CHECKOUT RENDERING
       ================================================== */
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
      updateWhatsAppButton();
    }

    /* ==================================================
       ORDER SUBMISSION
       ================================================== */
    async function submitOrder(event) {
      event.preventDefault();

      if (!state.cart.length) {
        setMessage("La lista está vacía.");
        return;
      }

      if (!el.checkoutForm.reportValidity()) return;

      if (!validatePostalCodeField()) return;

      const formBuyer = Object.fromEntries(new FormData(el.checkoutForm).entries());
      const orderSnapshot = buildOrderSnapshot(formBuyer, state.cart, currency);

      if (!orderSnapshot.items.length) {
        setMessage("La lista está vacía.");
        return;
      }

      if (isDevCatalog) {
        console.log("[ORDER DEBUG]", {
          buyer: orderSnapshot.buyer,
          cartItems: orderSnapshot.items,
          cartLength: orderSnapshot.items.length
        });
      }

      setSubmitting(true);
      setMessage("");

      console.log("[ORDER] Sending request", {
        endpoint: orderUrl,
        itemCount: orderSnapshot.items.length
      });

      try {
        const response = await fetch(orderUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(orderSnapshot)
        });

        console.log("[ORDER] Response", {
          status: response.status,
          contentType: response.headers.get("content-type")
        });

        const responseText = await response.text();
        let result = {};

        try {
          result = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error("[ORDER] Non-JSON response", {
            status: response.status,
            preview: responseText.slice(0, 500)
          });
          throw new Error(`NON_JSON_RESPONSE_${response.status}`);
        }

        if (!response.ok || !result.ok) {
          console.error("[ORDER] Request failed", {
            status: response.status,
            errorCode: result.error,
            message: result.message
          });
          throw new Error(result.error || `ORDER_REQUEST_FAILED_${response.status}`);
        }

        const orderNumber = String(result.orderNumber || "").trim();
        const completedOrderData = {
          ...orderSnapshot,
          orderNumber,
          submittedAt: new Date().toISOString()
        };

        state.completedOrder = completedOrderData;

        state.cart = [];
        saveCart();
        renderCart();
        el.checkoutForm.reset();

        setSubmitting(false);

        if (orderNumber) {
          setMessage(
            `Pedido enviado correctamente.\nNúmero de pedido: ${orderNumber}`,
            true
          );
        } else {
          setMessage("Pedido enviado correctamente.", true);
        }

        updateWhatsAppButton();
      } catch (error) {
        console.error("[ORDER] Request failed", error);
        setMessage("No se pudo enviar el pedido. Inténtalo nuevamente.");
        setSubmitting(false);
      }
    }

    /* ==================================================
       CLICK TRACKING
       ================================================== */
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

    /* ==================================================
       LAYER UI
       ================================================== */
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

    /* ==================================================
       UTILITY FUNCTIONS
       ================================================== */
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

    function formatCardPrice(amount) {
      const formatted = formatMoney(amount);
      if (currency === "MXN" && !/\bMXN\b/i.test(formatted)) {
        return `${formatted} MXN`;
      }
      return formatted;
    }

    /* ==================================================
       LOADING AND ERROR HANDLING
       ================================================== */
    function setStatus(message, isError) {
      if (!el.status) {
        console.error("[MSC catalog] cannot set status:", message);
        return;
      }

      el.status.hidden = false;
      el.status.textContent = message;
      el.status.classList.toggle("is-error", Boolean(isError));
    }

    function hideStatus() {
      if (!el.status) return;

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
      el.submit.textContent = value ? "Enviando..." : "Enviar pedido";
    }

    loadProducts();

    try {
      bindEvents();
      updateWhatsAppButton();
    } catch (initError) {
      console.error("[MSC catalog] non-blocking init error:", initError);
    }
  }

  /* ==================================================
     UTILITY FUNCTIONS
     ================================================== */
  function stripHtml(value) {
    const node = document.createElement("div");
    node.innerHTML = String(value || "");
    return (node.textContent || node.innerText || "").trim();
  }
})();
