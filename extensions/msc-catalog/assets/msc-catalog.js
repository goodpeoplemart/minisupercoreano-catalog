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

  function applyThemeHeaderLogo(logoUrl) {
    if (!logoUrl) return;

    document
      .querySelectorAll(
        ".header__heading-link, .site-header__logo a, .header__logo a",
      )
      .forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) return;

        const existingLogo = link.querySelector(".msc-header-logo");
        if (existingLogo instanceof HTMLImageElement) {
          existingLogo.src = logoUrl;
          link.dataset.mscHeaderLogoApplied = "true";
          return;
        }

        if (link.dataset.mscHeaderLogoApplied === "true") return;

        const img = document.createElement("img");
        img.src = logoUrl;
        img.alt = "Mini Super Coreano";
        img.className = "msc-header-logo";

        link.replaceChildren(img);
        link.setAttribute("aria-label", "Mini Super Coreano");
        link.dataset.mscHeaderLogoApplied = "true";
      });
  }

  function updateMobileHeaderHeight() {
    const header =
      document.querySelector("sticky-header .header") ||
      document.querySelector(".header-wrapper .header") ||
      document.querySelector("header.header") ||
      document.querySelector(".header");

    const height =
      header instanceof HTMLElement
        ? Math.max(0, Math.round(header.getBoundingClientRect().height))
        : 56;

    document.documentElement.style.setProperty(
      "--msc-mobile-header-height",
      `${height}px`,
    );
  }

  function updateDevToolbarOffset() {
    const bar =
      document.getElementById("PBarNextFrameWrapper") ||
      document.getElementById("PBarNextFrame") ||
      document.querySelector('[id*="PBarNextFrame"]');

    const height =
      bar instanceof HTMLElement ? Math.ceil(bar.getBoundingClientRect().height) : 0;

    document.documentElement.style.setProperty(
      "--msc-dev-toolbar-offset",
      `${Math.max(0, height)}px`,
    );
  }

  function placeListaButton(root, listaBtn) {
    if (!root || !listaBtn) return;

    const container = root.querySelector(".msc-container");
    const mobile = window.matchMedia("(max-width: 768px)").matches;

    if (mobile) {
      if (listaBtn.parentElement !== document.body) {
        document.body.appendChild(listaBtn);
      }
      return;
    }

    if (listaBtn.parentElement !== root) {
      root.insertBefore(listaBtn, container || null);
      return;
    }

    if (container && listaBtn.nextElementSibling !== container) {
      root.insertBefore(listaBtn, container);
    }
  }

  function ensureListaButton(root, cartLabel = "Lista") {
    if (!root) return null;

    let listaBtn =
      root.querySelector(":scope > [data-msc-open-cart]") ||
      document.querySelector(`[data-msc-open-cart][data-msc-catalog-id="${root.id}"]`) ||
      document.querySelector("[data-msc-open-cart]");

    if (!listaBtn) {
      listaBtn = document.createElement("button");
      listaBtn.type = "button";
      listaBtn.className = "msc-list-button";
      listaBtn.setAttribute("data-msc-open-cart", "");
      listaBtn.setAttribute("aria-label", "Abrir lista de compra");

      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "🛒";

      const label = document.createElement("span");
      label.textContent = cartLabel;

      const count = document.createElement("span");
      count.className = "msc-list-count";
      count.setAttribute("data-msc-cart-count", "");
      count.textContent = "0";

      listaBtn.append(icon, label, count);
    }

    listaBtn.dataset.mscCatalogId = root.id;

    const labelSpan = Array.from(listaBtn.children).find(
      (node) =>
        node instanceof HTMLSpanElement &&
        !node.hasAttribute("aria-hidden") &&
        !node.classList.contains("msc-list-count"),
    );
    if (labelSpan) labelSpan.textContent = cartLabel;

    if (!listaBtn.querySelector("[data-msc-cart-count]")) {
      const count = document.createElement("span");
      count.className = "msc-list-count";
      count.setAttribute("data-msc-cart-count", "");
      count.textContent = "0";
      listaBtn.appendChild(count);
    }

    listaBtn.hidden = false;
    listaBtn.removeAttribute("hidden");
    delete listaBtn.dataset.mscListaMounted;

    placeListaButton(root, listaBtn);
    updateDevToolbarOffset();

    return listaBtn;
  }

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
    const headerLogoUrl =
      root.dataset.headerLogoUrl || "/images/minisupercoreano-logo.png";
    const cartLabel = root.dataset.cartLabel || "Lista";
    const listaBtn = ensureListaButton(root, cartLabel);

    const cartDrawer = root.querySelector("[data-msc-cart-drawer]");
    const checkoutModal = root.querySelector("[data-msc-checkout-modal]");
    const productModal = root.querySelector("[data-msc-product-modal]");

    const el = {
      status: root.querySelector("[data-msc-status]"),
      grid: root.querySelector("[data-msc-products-grid]"),
      openCart: listaBtn,
      cartDrawer,
      closeCart: cartDrawer?.querySelectorAll("[data-msc-close-cart]") ?? [],
      cartBody: cartDrawer?.querySelector(".msc-cart-body"),
      cartCount: listaBtn?.querySelector("[data-msc-cart-count]"),
      cartItems: cartDrawer?.querySelector("[data-msc-cart-items]"),
      cartEmpty: cartDrawer?.querySelector("[data-msc-cart-empty]"),
      cartTotal: cartDrawer?.querySelector("[data-msc-cart-total]"),
      openCheckout: cartDrawer?.querySelector("[data-msc-open-checkout]"),
      productModal,
      productDialog: productModal?.querySelector(".msc-product-dialog"),
      closeProduct: productModal?.querySelectorAll("[data-msc-close-product]") ?? [],
      modalImage: productModal?.querySelector("[data-msc-modal-image]"),
      modalPlaceholder: productModal?.querySelector("[data-msc-modal-placeholder]"),
      modalTitle: productModal?.querySelector("[data-msc-modal-title]"),
      modalPrice: productModal?.querySelector("[data-msc-modal-price]"),
      modalDescription: productModal?.querySelector("[data-msc-modal-description]"),
      modalQuantity: productModal?.querySelector("[data-msc-modal-quantity]"),
      modalMinus: productModal?.querySelector("[data-msc-modal-minus]"),
      modalPlus: productModal?.querySelector("[data-msc-modal-plus]"),
      addCart: productModal?.querySelector("[data-msc-add-cart]"),
      checkoutModal,
      checkoutInner: checkoutModal?.querySelector(".msc-checkout-inner"),
      checkoutFormPanel: checkoutModal?.querySelector("[data-msc-checkout-form-panel]"),
      closeCheckout: checkoutModal?.querySelectorAll("[data-msc-close-checkout]") ?? [],
      checkoutForm: checkoutModal?.querySelector("[data-msc-checkout-form]"),
      checkoutItems: checkoutModal?.querySelector("[data-msc-checkout-items]"),
      checkoutTotal: checkoutModal?.querySelector("[data-msc-checkout-total]"),
      submit: checkoutModal?.querySelector("[data-msc-submit]"),
      whatsappInfo: checkoutModal?.querySelector("[data-msc-whatsapp-info]"),
      message: checkoutModal?.querySelector("[data-msc-message]"),
      successModal: checkoutModal?.querySelector("[data-msc-success-modal]"),
      successMessage: checkoutModal?.querySelector("[data-msc-success-message]"),
      successError: checkoutModal?.querySelector("[data-msc-success-error]"),
      successWhatsapp: checkoutModal?.querySelector("[data-msc-success-whatsapp]"),
      devWhatsAppTest: checkoutModal?.querySelector("[data-msc-dev-whatsapp-test]")
    };

    [el.productModal, el.cartDrawer, el.checkoutModal].forEach((layer) => {
      if (!layer) return;
      layer.hidden = true;
      layer.setAttribute("aria-hidden", "true");
      layer.style.setProperty("display", "none", "important");
    });

    if (el.successModal) {
      el.successModal.hidden = true;
      el.successModal.setAttribute("aria-hidden", "true");
    }

    el.checkoutModal?.classList.remove("is-order-success");

    /* ==================================================
       APPLICATION STATE
       ================================================== */
    const state = {
      products: [],
      cart: [],
      selectedProduct: null,
      selectedQuantity: 1,
      completedOrder: null,
      isLoadingProducts: false,
      isSubmitting: false
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

    function buildWhatsAppMessageFromCompletedOrder() {
      if (!isCompletedOrderReady(state.completedOrder)) return null;
      return buildWhatsAppOrderMessage(state.completedOrder);
    }

    function buildWhatsAppMessageFromCheckoutForm() {
      if (!el.checkoutForm?.reportValidity()) return null;
      if (!validatePostalCodeField()) return null;
      if (!state.cart.length) return null;

      const formBuyer = Object.fromEntries(new FormData(el.checkoutForm).entries());
      const orderSnapshot = buildOrderSnapshot(formBuyer, state.cart, currency);

      return buildWhatsAppOrderMessage(orderSnapshot);
    }

    function handleCheckoutWhatsAppClick() {
      const completedMessage = buildWhatsAppMessageFromCompletedOrder();
      if (completedMessage) {
        console.log("[WHATSAPP]", {
          orderNumber: state.completedOrder.orderNumber,
          itemCount: state.completedOrder.items.length,
          buyerName: state.completedOrder.buyer?.name,
          messageLength: completedMessage.length
        });
        openWhatsAppWithMessage(completedMessage);
        return;
      }

      const checkoutMessage = buildWhatsAppMessageFromCheckoutForm();
      if (!checkoutMessage) {
        setMessage("La lista está vacía.");
        return;
      }

      openWhatsAppWithMessage(checkoutMessage);
    }

    function isCheckoutSuccessVisible() {
      return Boolean(el.successModal && !el.successModal.hidden);
    }

    function showCheckoutFormView() {
      if (el.checkoutFormPanel) {
        el.checkoutFormPanel.hidden = false;
        el.checkoutFormPanel.setAttribute("aria-hidden", "false");
      }

      hideOrderSuccessModal();
      el.checkoutModal?.classList.remove("is-order-success");
    }

    function showCheckoutSuccessView(orderNumber) {
      if (el.checkoutFormPanel) {
        el.checkoutFormPanel.hidden = true;
        el.checkoutFormPanel.setAttribute("aria-hidden", "true");
      }

      showOrderSuccessModal(orderNumber);
      el.checkoutModal?.classList.add("is-order-success");

      if (el.checkoutInner) {
        el.checkoutInner.scrollTop = 0;
      }
      resetModalScroll(el.checkoutFormPanel);
      resetModalScroll(el.successModal);
    }

    function showOrderSuccessModal(orderNumber) {
      if (!el.successModal) return;

      const text = orderNumber
        ? `El pedido se envió correctamente por correo electrónico.\nNúmero de pedido: ${orderNumber}`
        : "El pedido se envió correctamente por correo electrónico.";

      if (el.successMessage) el.successMessage.textContent = text;
      if (el.successError) {
        el.successError.hidden = true;
        el.successError.textContent = "";
      }

      el.successModal.hidden = false;
      el.successModal.setAttribute("aria-hidden", "false");
    }

    function hideOrderSuccessModal() {
      if (!el.successModal) return;

      el.successModal.hidden = true;
      el.successModal.setAttribute("aria-hidden", "true");

      if (el.successError) {
        el.successError.hidden = true;
        el.successError.textContent = "";
      }
    }

    function setSuccessModalError(message) {
      if (!el.successError) return;

      el.successError.hidden = !message;
      el.successError.textContent = message || "";
    }

    function handleSuccessWhatsAppClick() {
      try {
        const whatsappMessage = buildWhatsAppMessageFromCompletedOrder();

        if (!whatsappMessage) {
          throw new Error("Completed order data unavailable for WhatsApp");
        }

        openWhatsAppWithMessage(whatsappMessage);
        handleSuccessModalClose();
      } catch (error) {
        console.error("[WHATSAPP] open failed:", error);
        setSuccessModalError("No se pudo preparar el envío por WhatsApp.");
      }
    }

    function resetOrderAndBuyerData() {
      state.completedOrder = null;
      state.cart = [];
      saveCart();
      renderCart();
      showCheckoutFormView();
      hideLayer(el.checkoutModal);
      el.checkoutForm?.reset();
      setMessage("");
      updateWhatsAppButton();
    }

    function handleSuccessModalClose() {
      resetOrderAndBuyerData();
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

    function isMobileCatalogViewport() {
      return window.matchMedia("(max-width: 768px)").matches;
    }

    function findProductCard(productId) {
      if (!productId || !el.grid) return null;

      const escapedId =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(String(productId))
          : String(productId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      return el.grid.querySelector(`[data-msc-product-id="${escapedId}"]`);
    }

    function scrollToProductCardAfterAdd(productId) {
      if (!productId || !isMobileCatalogViewport()) return;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = findProductCard(productId);
          if (target) {
            target.scrollIntoView({ behavior: "auto", block: "start" });
          }
        });
      });
    }

    /* ==================================================
       EVENT LISTENERS
       ================================================== */
    function isModalLayer(element) {
      return Boolean(
        element?.matches?.(
          "[data-msc-product-modal], [data-msc-cart-drawer], [data-msc-checkout-modal]",
        ),
      );
    }

    function syncModalLayerDisplay(element, visible) {
      if (!isModalLayer(element)) return;

      element.style.setProperty("display", visible ? "flex" : "none", "important");
    }

    function closeAllModals() {
      [el.productModal, el.cartDrawer, el.checkoutModal].forEach((modal) => {
        if (!modal) return;
        hideLayer(modal);
      });

      hideOrderSuccessModal();
      showCheckoutFormView();
      el.checkoutModal?.classList.remove("is-order-success");
    }

    function handleOpenCartClick(event) {
      event.preventDefault();
      event.stopPropagation();

      if (!event.currentTarget?.matches("[data-msc-open-cart]")) return;

      openCart();
    }

    function handleOpenCheckoutClick(event) {
      event.preventDefault();
      event.stopPropagation();

      if (!event.currentTarget?.matches("[data-msc-open-checkout]")) return;

      openCheckout();
    }

    function bindEvents() {
      el.openCart?.addEventListener("click", handleOpenCartClick);
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

        const addedProductId = state.selectedProduct.id;
        addToCart(state.selectedProduct, state.selectedQuantity);
        closeProduct();
        scrollToProductCardAfterAdd(addedProductId);
      });

      el.openCheckout?.addEventListener("click", handleOpenCheckoutClick);

      el.checkoutForm?.addEventListener("submit", submitOrder);
      bindPostalCodeInput();

      el.whatsappInfo?.addEventListener("click", handleCheckoutWhatsAppClick);
      el.successWhatsapp?.addEventListener("click", handleSuccessWhatsAppClick);

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

      let phase = "fetch";

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

        phase = "parse";

        console.log("[MSC catalog] products HTTP response", {
          url: productsUrl,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get("content-type") || "",
          bodyPreview: rawText.slice(0, 160),
          looksLikeHtml: rawText.trim().startsWith("<")
        });

        if (rawText.trim().startsWith("<")) {
          throw new Error(
            `HTTP ${response.status}: HTML response (app proxy or session issue).`
          );
        }

        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch (parseError) {
          console.error("[MSC catalog] invalid JSON payload:", parseError, rawText.slice(0, 200));
          throw new Error(`HTTP ${response.status}: invalid JSON response.`);
        }

        phase = "validate";

        const hasProductsArray = Array.isArray(payload?.products);

        if (!response.ok || payload?.ok === false) {
          console.error("[MSC catalog] products API error:", {
            status: response.status,
            responseOk: response.ok,
            payloadOk: payload?.ok,
            hasProductsArray,
            payload
          });
          throw new Error(
            payload?.error ||
              payload?.message ||
              `HTTP ${response.status}`
          );
        }

        phase = "extract";

        const extracted = extractProducts(payload);

        console.log("[MSC catalog] extracted products", {
          count: extracted.length,
          shape: hasProductsArray
            ? "payload.products"
            : Array.isArray(payload?.data?.products)
              ? "payload.data.products"
              : "unknown"
        });

        if (!extracted.length) {
          console.error("[MSC catalog] products array empty or missing:", payload);
          setStatus("No hay productos publicados disponibles.", false);
          return;
        }

        phase = "normalize";

        const normalized = extracted
          .map(normalizeProduct)
          .filter((product) => product.id && product.title);

        if (!normalized.length) {
          console.error("[MSC catalog] normalize dropped all products:", {
            sample: extracted[0]
          });
          setStatus("No hay productos publicados disponibles.", false);
          return;
        }

        state.products = normalized;

        phase = "render";

        restoreCart();
        hideStatus();
        renderProducts();

        try {
          renderCart();
        } catch (cartRenderError) {
          console.error("[MSC catalog] cart render failed after products loaded:", cartRenderError);
        }

        closeAllModals();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[MSC catalog] product loading failed:", {
          phase,
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
        card.dataset.mscProductId = product.id;

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
    function resetModalScroll(target) {
      if (!target) return;
      target.scrollTop = 0;
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
      el.addCart.textContent = product.available
        ? "Agregar a la lista"
        : "Producto no disponible";
      el.addCart.setAttribute(
        "aria-label",
        product.available
          ? "Agregar a la lista"
          : "Producto no disponible",
      );
      updateModalQuantity();
      showLayer(el.productModal);
      requestAnimationFrame(() => {
        resetModalScroll(el.productDialog);
      });
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
      if (!el.cartItems || !el.cartTotal || !el.openCheckout || !el.cartEmpty) {
        console.warn("[MSC catalog] cart DOM incomplete, skipping cart render");
        return;
      }

      el.cartItems.innerHTML = "";
      const totalQuantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = state.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

      if (el.cartCount) {
        el.cartCount.textContent = String(totalQuantity);
      }
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

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "msc-cart-remove";
        remove.textContent = "Eliminar";
        remove.addEventListener("click", () => {
          state.cart = state.cart.filter((cartItem) => cartItem !== item);
          renderCart();
        });

        actions.append(remove);
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
      hideLayer(el.checkoutModal);
      renderCart();
      showLayer(el.cartDrawer);
      requestAnimationFrame(() => {
        resetModalScroll(el.cartBody);
      });
    }

    function closeCart() {
      hideLayer(el.cartDrawer);
    }

    function openCheckout() {
      if (!state.cart.length) return;

      closeCart();
      state.completedOrder = null;
      showCheckoutFormView();
      renderCheckout();

      if (el.checkoutInner) {
        el.checkoutInner.scrollTop = 0;
      }

      showLayer(el.checkoutModal);
      updateWhatsAppButton();

      requestAnimationFrame(() => {
        resetModalScroll(el.checkoutFormPanel);

        const firstField = el.checkoutForm?.querySelector('input[name="name"]');
        firstField?.focus({ preventScroll: true });
      });
    }

    /* ==================================================
       CHECKOUT RENDERING
       ================================================== */
    function renderCheckout() {
      if (el.checkoutItems) {
        el.checkoutItems.innerHTML = "";
      }

      if (el.checkoutTotal) {
        el.checkoutTotal.textContent = formatMoney(getCartTotal());
      }
    }

    function closeCheckout() {
      if (isCheckoutSuccessVisible()) {
        handleSuccessModalClose();
        return;
      }

      showCheckoutFormView();
      hideLayer(el.checkoutModal);
      setMessage("");
      updateWhatsAppButton();
    }

    /* ==================================================
       ORDER SUBMISSION
       ================================================== */
    async function submitOrder(event) {
      event.preventDefault();

      if (state.isSubmitting) return;

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

      console.log("[EMAIL] submit started");

      if (isDevCatalog) {
        console.log("[ORDER DEBUG]", {
          buyer: orderSnapshot.buyer,
          cartItems: orderSnapshot.items,
          cartLength: orderSnapshot.items.length
        });
      }

      state.isSubmitting = true;
      setSubmitting(true);
      setMessage("");
      showCheckoutFormView();

      console.log("[EMAIL] payload", {
        buyer: orderSnapshot.buyer,
        itemCount: orderSnapshot.items.length,
        subtotal: orderSnapshot.subtotal,
        total: orderSnapshot.total,
        currency: orderSnapshot.currency
      });

      try {
        const response = await fetch(orderUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(orderSnapshot)
        });

        console.log("[EMAIL] response status", response.status);

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

        console.log("[EMAIL] response body", result);

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
        showCheckoutSuccessView(orderNumber);
        updateWhatsAppButton();
      } catch (error) {
        console.error("[EMAIL] failed", error);
        showCheckoutFormView();
        setMessage("No se pudo enviar el pedido. Inténtalo nuevamente.");
      } finally {
        state.isSubmitting = false;
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
      updateMobileHeaderHeight();
      element.hidden = false;
      element.setAttribute("aria-hidden", "false");
      syncModalLayerDisplay(element, true);
      document.documentElement.classList.add("msc-lock");
      document.body.classList.add("msc-lock");
    }

    function hideLayer(element) {
      if (!element) return;
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
      syncModalLayerDisplay(element, false);

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

    const syncMobileLayout = () => {
      updateMobileHeaderHeight();
      updateDevToolbarOffset();
      placeListaButton(root, listaBtn);
    };

    window.addEventListener("resize", syncMobileLayout, { passive: true });
    window.addEventListener("orientationchange", syncMobileLayout, { passive: true });
    window.addEventListener("load", syncMobileLayout, { once: true });

    try {
      bindEvents();
      closeAllModals();
      updateWhatsAppButton();
      syncMobileLayout();
      applyThemeHeaderLogo(headerLogoUrl);
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
