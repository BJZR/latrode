function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

class App {
  imgUrl(url) {
    if (!url || url.startsWith('http') || url.startsWith('/')) return url;
    return '/images/' + url;
  }

  constructor() {
    this.products = [];
    this.cart = [];
    this.favorites = [];
    this.currentProduct = null;
    this.selectedColor = null;
    this.selectedSize = null;
    this.user = null;
    this.isSearching = false;
    this.lastScrollPosition = 0;
    this.lastExpandedIndex = null;
    this.pendingPurchase = JSON.parse(sessionStorage.getItem('pendingPurchase') || 'null');
    this.page = 1;
    this.limit = 20;
    this.totalPages = 1;
    this.totalProducts = 0;
    this.init();
  }

  async init() {
    await this.loadProducts();
    this.renderProducts();
    this.bindEvents();
    this.loadTheme();
    await this.checkAuthStatus();
    this.resumePendingPurchase();
    this.loadSettings();
    this.checkEmailQuota();
    document.getElementById("splash-screen").classList.add("hidden");
    var s = document.getElementById("splash-scroll-lock");
    if (s) s.remove();
  }

  async loadSettings() {
    try {
      const settings = await API.getSettings();
      const phone = settings.contact_phone || '';
      const email = settings.contact_email || '';
      const phoneEl = document.getElementById("help-phone");
      const emailEl = document.getElementById("help-email");
      if (phoneEl && phone) phoneEl.textContent = phone;
      if (emailEl && email) emailEl.textContent = email;
    } catch (e) {}
  }

  async checkEmailQuota() {
    try {
      const q = await API.getEmailQuota();
      if (!q.available) {
        this.showNotification("Límite de correos alcanzado. Inténtalo en 24 horas.", "warning");
      }
    } catch (e) {}
  }

  async checkAuthStatus() {
    try {
      const response = await API.getProfile();
      if (response && response.id) {
        this.user = response;
        this.updateLoggedInUI();
        await this.loadCart();
        await this.loadFavorites();
        if (this.user.googleId && !this.user.hasPassword) {
          setTimeout(() => {
            document.getElementById("set-password-overlay").classList.add("active");
          }, 1000);
        }
        return;
      }
    } catch (e) {
    }
    await this.loadCart();
    await this.loadFavorites();
  }

  async loadProducts(page, query = '') {
    this.page = page || this.page;
    try {
      const res = await API.getProducts(query, this.page, this.limit);
      if (res && res.data) {
        this.products = res.data;
        this._allProducts = res.data;
        this.totalPages = res.totalPages || 1;
        this.totalProducts = res.total || 0;
      } else {
        this.products = res || [];
        this._allProducts = res || [];
      }
    } catch (error) {
      console.warn('loadProducts error:', error);
    }
  }

  renderProducts() {
    const feed = document.getElementById("product-feed");
    feed.innerHTML = "";

    this.products.forEach((product, index) => {
      const slide = document.createElement("section");
      slide.className = "slide";
      slide.dataset.index = index;

      slide.innerHTML = `
                <article class="card" data-product-id="${product.id}" data-index="${index}">
                    <div class="card-image">
                        <img src="${this.imgUrl(product.imageUrl)}" alt="${escapeHTML(product.name)}" class="main-product-image" data-original-image="${this.imgUrl(product.imageUrl)}" loading="lazy">
                    </div>
                    <div class="card-info-wrapper">
                        <div class="card-content">
                            <p class="product-name">${escapeHTML(product.name)}</p>
                            <div class="tag">#${escapeHTML(product.category)}</div>
                            <div class="price">$${Math.round(product.finalPrice || product.price).toLocaleString()}</div>
                            <button class="details-btn" aria-label="Ver detalles">
                              <svg viewBox="0 0 24 24" width="28" height="28"><use href="assets/icons/dots.svg#icon"/></svg>
                            </button>
                        </div>
                        <div class="expanded-content">
                            <div class="color-selector">
                                <span class="color-label">Colores disponibles:</span>
                                <div class="color-options">
                                    ${
                                      product.colors &&
                                      product.colors.length > 0
                                        ? product.colors
                                            .map(
                                              (color, i) => `
                                        <button class="color-option"
                                                data-color-id="${color.id}"
                                                data-color-name="${escapeHTML(color.name)}"
                                                data-sizes-stock='${JSON.stringify(color.sizes || [])}'
                                                style="background: ${escapeHTML(color.hex)}"
                                                data-image="${this.imgUrl(color.imageUrl || product.imageUrl)}"
                                                aria-label="${escapeHTML(color.name)}"></button>
                                    `,
                                            )
                                            .join("")
                                        : ""
                                    }
                                </div>
                                <div class="color-name-label"></div>
                            </div>
                            <div class="size-selector">
                                <span class="size-label">Talla:</span>
                                <div class="size-options">
                                    ${
                                      product.sizes &&
                                      product.sizes.length > 0
                                        ? (() => {
                                            return product.sizes.map((size, i) => {
                                              return `<button class="size-option"
                                                  data-size="${size}">${size}</button>`;
                                            }).join("");
                                          })()
                                        : ""
                                    }
                                </div>
                            </div>
                            <div class="material-info">
                                <strong>Material:</strong> Lana y algodón de alta calidad.<br>
                                ${escapeHTML(product.description || "Diseño de alta calidad para uso diario.")}
                            </div>
                        </div>
                    </div>
                </article>
            `;

      feed.appendChild(slide);
      this.bindCardEvents(slide);
    });

    if (!this.isSearching && this.totalPages > 1) {
      this.renderPagination(feed);
    }
  }

  renderPagination(feed) {
    const nav = document.createElement("div");
    nav.className = "pagination-nav";

    const prev = document.createElement("button");
    prev.className = "pagination-btn";
    prev.textContent = "‹ Anterior";
    prev.disabled = this.page <= 1;
    prev.addEventListener("click", () => this.goToPage(this.page - 1));

    const info = document.createElement("span");
    info.className = "pagination-info";
    info.textContent = `Página ${this.page} de ${this.totalPages}`;

    const next = document.createElement("button");
    next.className = "pagination-btn";
    next.textContent = "Siguiente ›";
    next.disabled = this.page >= this.totalPages;
    next.addEventListener("click", () => this.goToPage(this.page + 1));

    nav.appendChild(prev);
    nav.appendChild(info);
    nav.appendChild(next);
    feed.after(nav);
  }

  async goToPage(page) {
    this.collapseCard();
    this.lastScrollPosition = 0;
    this.lastExpandedIndex = null;
    await this.loadProducts(page, this._searchQuery || '');
    this.renderProducts();
    const feed = document.getElementById("product-feed");
    if (feed) feed.scrollTo({ top: 0, behavior: "smooth" });
  }

  bindEvents() {
    document
      .getElementById("main-action-btn")
      .addEventListener("click", (e) => this.handleMainAction(e));
    document
      .getElementById("search-trigger-btn")
      .addEventListener("click", (e) => this.handleSearchAction(e));
    document
      .getElementById("profile-trigger-btn")
      .addEventListener("click", (e) => this.handleProfileAction(e));
    document
      .getElementById("menu-trigger-btn")
      .addEventListener("click", (e) => this.handleMenuAction(e));

    document
      .querySelector(".search-confirm-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.performSearch();
      });
    document.querySelector(".search-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.performSearch();
      }
      if (e.key === "Escape") this.closeSearch();
    });
    document
      .querySelector(".search-clear-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        const input = document.querySelector(".search-input");
        input.value = "";
        document.querySelector(".search-clear-btn").style.display = "none";
        input.focus();
      });
    document.querySelector(".search-input").addEventListener("input", (e) => {
      document.querySelector(".search-clear-btn").style.display = e.target.value
        ? "block"
        : "none";
    });

    document.querySelectorAll(".menu-item[data-action]").forEach((item) => {
      item.addEventListener("click", () =>
        this.handleMenuActionItem(item.dataset.action),
      );
    });

    document.getElementById("theme-option").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("menu-overlay").classList.remove("active");
      setTimeout(() => {
        document.getElementById("theme-overlay").classList.add("active");
        this.updateThemeSelection();
      }, 100);
    });

    document
      .getElementById("back-from-help")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById("help-overlay").classList.remove("active");
        setTimeout(() => {
          document.getElementById("menu-overlay").classList.add("active");
        }, 100);
      });

    document
      .getElementById("back-from-theme")
      .addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById("theme-overlay").classList.remove("active");
        setTimeout(() => {
          document.getElementById("menu-overlay").classList.add("active");
        }, 100);
      });

    document.querySelectorAll(".theme-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = option.getAttribute("data-theme");
        this.setTheme(theme);
        this.updateThemeSelection();
      });
    });

    document.querySelectorAll(".back-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.goBack();
      });
    });

    document.querySelector(".checkout-btn").addEventListener("click", () => {
      this.openCheckout();
    });

    document
      .querySelector(".confirm-order-btn")
      .addEventListener("click", () => this.confirmOrder());

    document.getElementById("confirm-cancel-btn").addEventListener("click", () => {
      document.getElementById("confirm-order-overlay").classList.remove("active");
      this._pendingOrder = null;
    });

    document.getElementById("confirm-accept-btn").addEventListener("click", () => {
      this.submitOrder();
    });

    document
      .querySelector("#add-to-cart-overlay .close-panel-btn")
      .addEventListener("click", () => this.closeAddToCartModal());
    document
      .getElementById("add-to-cart-confirm")
      .addEventListener("click", () => this.confirmAddToCart());

    document
      .getElementById("login-option")
      .addEventListener("click", () => this.showLoginForm());
    document
      .getElementById("register-option")
      .addEventListener("click", () => this.showRegisterForm());
    document
      .getElementById("login-form-el")
      .addEventListener("submit", (e) => this.handleLogin(e));
    document
      .getElementById("register-form-el")
      .addEventListener("submit", (e) => this.handleRegister(e));

    document
      .getElementById("back-from-login")
      .addEventListener("click", () => this.showProfileOptions());
    document
      .getElementById("back-from-register")
      .addEventListener("click", () => this.showProfileOptions());
    document
      .getElementById("back-from-reset")
      .addEventListener("click", () => this.showLoginForm());

    document
      .getElementById("forgot-password-link")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.showPasswordReset();
      });
    document
      .getElementById("reset-email-form")
      .addEventListener("submit", (e) => this.handleForgotPassword(e));
    document
      .getElementById("reset-code-form")
      .addEventListener("submit", (e) => this.handleVerifyResetCode(e));
    document
      .getElementById("reset-password-form")
      .addEventListener("submit", (e) => this.handleResetPassword(e));
    document
      .getElementById("resend-code-link")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.showPasswordReset();
      });

    document
      .getElementById("logout-btn")
      .addEventListener("click", () => this.handleLogout());
    document
      .getElementById("set-password-btn")
      .addEventListener("click", () => {
        this.closeAllOverlays();
        document.getElementById("set-password-overlay").classList.add("active");
      });
    document
      .getElementById("set-password-form")
      .addEventListener("submit", (e) => this.handleSetPassword(e));

    document
      .getElementById("edit-profile-btn")
      .addEventListener("click", () => this.openProfileEdit());

    document
      .getElementById("profile-orders-btn")
      .addEventListener("click", () => {
        this.closeAllOverlays();
        this.loadUserOrders();
      });

    document
      .getElementById("profile-checkout-btn")
      .addEventListener("click", () => {
        if (!this.user) {
          this.showNotification("Inicia sesión para continuar", "error");
          return;
        }
        if (!this.cart || this.cart.length === 0) {
          this.showNotification("Tu carrito está vacío", "error");
          return;
        }
        this.openCheckout();
      });

    document
      .getElementById("profile-favorites-btn")
      .addEventListener("click", () => {
        this.closeAllOverlays();
        this.loadFavorites();
        document.getElementById("favorites-overlay").classList.add("active");
      });

    document
      .getElementById("search-filter-btn")
      .addEventListener("click", () => {
        this.buildFilterCategories();
        this.closeSearch();
        document.getElementById("filters-overlay").classList.add("active");
      });

    document
      .getElementById("close-filters-btn")
      .addEventListener("click", () => {
        document.getElementById("filters-overlay").classList.remove("active");
        this.closeSearch();
      });

    document
      .getElementById("filter-category-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const sub = document.getElementById("filter-category-submenu");
        const other = document.getElementById("filter-sort-submenu");
        other.style.display = "none";
        sub.style.display = sub.style.display === "none" ? "block" : "none";
      });

    document
      .getElementById("filter-sort-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const sub = document.getElementById("filter-sort-submenu");
        const other = document.getElementById("filter-category-submenu");
        other.style.display = "none";
        sub.style.display = sub.style.display === "none" ? "block" : "none";
      });

    document.querySelectorAll("#filter-category-submenu .filter-suboption").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        document.getElementById("filter-category-value").textContent = val || "Todas";
        document.getElementById("filter-category-submenu").style.display = "none";
        this._filterCategory = val;
      });
    });

    document.querySelectorAll("#filter-sort-submenu .filter-suboption").forEach(btn => {
      btn.addEventListener("click", () => {
        const names = { "": "Por defecto", "price-asc": "Menor precio", "price-desc": "Mayor precio", "name-asc": "A-Z", "name-desc": "Z-A" };
        document.getElementById("filter-sort-value").textContent = names[btn.dataset.value] || "Por defecto";
        document.getElementById("filter-sort-submenu").style.display = "none";
        this._filterSort = btn.dataset.value;
      });
    });

    document.addEventListener("click", () => {
      document.getElementById("filter-category-submenu").style.display = "none";
      document.getElementById("filter-sort-submenu").style.display = "none";
    });

    document
      .getElementById("apply-filters-btn")
      .addEventListener("click", () => {
        this.applyFilters();
        document.getElementById("filters-overlay").classList.remove("active");
        this.closeSearch();
      });

    document
      .getElementById("reset-filters-btn")
      .addEventListener("click", () => {
        this.resetFilters();
        document.getElementById("filters-overlay").classList.remove("active");
        this.closeSearch();
      });

    document
      .getElementById("profile-form")
      .addEventListener("submit", (e) => this.handleProfileUpdate(e));
    document
      .getElementById("logout-option")
      .addEventListener("click", () => this.handleLogout());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Esc") this.handleEscape();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const feed = document.getElementById("product-feed");
        if (feed && !document.querySelector(".card.expanded") && !document.querySelector(".menu-overlay.active")) {
          e.preventDefault();
          feed.scrollBy({ top: e.key === "ArrowDown" ? 100 : -100, behavior: "smooth" });
        }
      }
    });

    document.querySelectorAll(".menu-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeAllOverlays();
      });
    });

    document.querySelectorAll(".close-panel-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.closeAllOverlays());
    });

    const addCartOverlay = document.getElementById("add-to-cart-overlay");
    if (addCartOverlay) {
      addCartOverlay.addEventListener("click", (e) => {
        if (e.target === addCartOverlay) this.closeAddToCartModal();
      });
    }

    const searchOverlay = document.getElementById("search-overlay");
    if (searchOverlay) {
      searchOverlay.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeSearch();
      });
    }

    document.querySelectorAll(".floating-bar button").forEach((btn) => {
      btn.addEventListener("click", function () {
        this.style.transform = "scale(0.9)";
        setTimeout(() => {
          this.style.transform = "";
        }, 150);
      });
    });

    const feed = document.getElementById("product-feed");
    feed.addEventListener("click", (e) => {
      const btn = e.target.closest(".details-btn");
      if (btn) {
        this.expandCard(btn.closest(".card"));
      }
    });

    document.querySelectorAll(".toggle-password").forEach((btn) => {
      btn.addEventListener("click", () => this.togglePassword(btn));
    });
  }

  togglePassword(btn) {
    const wrapper = btn.closest(".password-wrapper");
    const input = wrapper.querySelector("input");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.querySelector(".eye-open").style.display = isPassword ? "none" : "";
    btn.querySelector(".eye-closed").style.display = isPassword ? "" : "none";
    btn.setAttribute("aria-label", isPassword ? "Ocultar contraseña" : "Mostrar contraseña");
  }

  bindCardEvents(card) {
    card.querySelectorAll(".color-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        if (option.classList.contains("active")) {
          option.classList.remove("active");
          const img = card.querySelector(".main-product-image");
          if (img) img.src = img.dataset.originalImage;
          const nameEl = card.querySelector(".color-name-label");
          if (nameEl) nameEl.textContent = "";
          return;
        }
        card
          .querySelectorAll(".color-option")
          .forEach((o) => o.classList.remove("active"));
        option.classList.add("active");
        const imageUrl = option.getAttribute("data-image");
        if (imageUrl) {
          card.querySelector(".main-product-image").src = imageUrl;
        }
        const nameEl = card.querySelector(".color-name-label");
        if (nameEl) {
          nameEl.textContent = option.getAttribute("data-color-name") || "";
        }
      });
    });

    card.querySelectorAll(".size-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        if (option.classList.contains("active")) {
          option.classList.remove("active");
          return;
        }
        card
          .querySelectorAll(".size-option")
          .forEach((o) => o.classList.remove("active"));
        option.classList.add("active");
      });
    });

  }

  async handleMainAction(e) {
    e.stopPropagation();
    if (document.body.classList.contains("expanded-mode")) {
      this.collapseCard();
    } else {
      await this.loadCart();
      document.getElementById("cart-overlay").classList.add("active");
      this.updateCartSummary();
    }
  }

  handleSearchAction(e) {
    e.stopPropagation();
    e.preventDefault();
    if (document.body.classList.contains("expanded-mode")) {
      this.openAddToCartModal();
    } else if (this.isSearching) {
      this.clearSearch();
    } else {
      document.body.classList.add("search-active");
      setTimeout(() => document.querySelector(".search-input").focus(), 100);
    }
  }

  handleProfileAction(e) {
    e.stopPropagation();
    if (document.body.classList.contains("expanded-mode")) {
      this.toggleFavorite();
    } else {
      document.getElementById("profile-overlay").classList.add("active");
      if (this.user) {
        this.updateLoggedInUI();
      } else {
        this.showProfileOptions();
      }
    }
  }

  handleMenuAction(e) {
    e.stopPropagation();
    if (document.body.classList.contains("expanded-mode")) {
      this.addCurrentToCart();
    } else {
      document.getElementById("menu-overlay").classList.add("active");
    }
  }

  async handleMenuActionItem(action) {
    this.closeAllOverlays();
    switch (action) {
      case "home":
        this.collapseCard();
        if (this.isSearching) {
          this.isSearching = false;
          await this.loadProducts(1);
          this.renderProducts();
          this.showNotification("Volviendo al inicio", "info");
        }
        break;
      case "cart":
        this.loadCart();
        document.getElementById("cart-overlay").classList.add("active");
        break;
      case "favorites":
        this.loadFavorites();
        document.getElementById("favorites-overlay").classList.add("active");
        break;
      case "profile":
        document.getElementById("profile-overlay").classList.add("active");
        this.showProfileOptions();
        break;
      case "theme":
        document.getElementById("theme-overlay").classList.add("active");
        break;
      case "orders":
        this.loadUserOrders();
			break;
		case "help":
			document.getElementById("help-overlay").classList.add("active");
			break;
		case "fullscreen":
			this.toggleFullscreen();
			break;
	}
  }

  expandCard(card) {
    document
      .querySelectorAll(".card")
      .forEach((c) => c.classList.remove("expanded"));
    card.classList.add("expanded");
    document.body.classList.add("expanded-mode");
    document.getElementById("product-feed").style.overflow = "hidden";

    this.selectedColor = null;
    this.selectedSize = null;
    card.querySelectorAll(".color-option.active, .size-option.active").forEach((btn) => btn.classList.remove("active"));
    const nameEl = card.querySelector(".color-name-label");
    if (nameEl) nameEl.textContent = "";

	this.currentProduct = this.products.find(
      (p) => String(p.id) === card.dataset.productId,
    );
    this.updateFavoriteIcon();
    if (this.currentProduct) {
      const urls = [this.currentProduct.imageUrl];
      if (this.currentProduct.colors) {
        this.currentProduct.colors.forEach(c => {
          if (c.imageUrl) urls.push(c.imageUrl);
        });
      }
      urls.forEach(url => {
        const img = new Image();
        img.src = this.imgUrl(url);
      });
    }
  }

  collapseCard() {
    document
      .querySelectorAll(".card.expanded")
      .forEach((c) => c.classList.add("collapsing"));
    document
      .querySelectorAll(".card")
      .forEach((c) => c.classList.remove("expanded"));
    document
      .querySelectorAll(".main-product-image")
      .forEach((img) => {
        const orig = img.getAttribute("data-original-image");
        if (orig) img.src = orig;
      });
    document.body.classList.remove("expanded-mode");
    document.getElementById("product-feed").style.overflow = "scroll";
    this.currentProduct = null;
    setTimeout(() => {
      document
        .querySelectorAll(".card")
        .forEach((c) => c.classList.remove("collapsing"));
    }, 400);
  }

  closeSearch() {
    document.body.classList.remove("search-active");
    document.querySelector(".search-input").value = "";
    document.querySelector(".search-clear-btn").style.display = "none";
  }

  updateSearchIcons() {
    const btn = document.getElementById("search-trigger-btn");
    btn.querySelector(".icon-search").style.display = this.isSearching ? "none" : "";
    btn.querySelector(".icon-home").style.display = this.isSearching ? "block" : "none";
  }

  async clearSearch() {
    this.isSearching = false;
    this._searchQuery = '';
    this.updateSearchIcons();
    this.closeSearch();
    await this.loadProducts(1);
    this.renderProducts();

    if (this.lastExpandedIndex !== null) {
      setTimeout(() => {
        const slides = document.querySelectorAll(".slide");
        if (slides[this.lastExpandedIndex]) {
          slides[this.lastExpandedIndex].scrollIntoView({ behavior: "smooth" });
          const card = slides[this.lastExpandedIndex].querySelector(".card");
          if (card) {
            setTimeout(() => {
              this.expandCard(card);
            }, 300);
          }
        }
      }, 100);
    } else {
      setTimeout(() => {
        const feed = document.getElementById("product-feed");
        feed.scrollTo({ top: this.lastScrollPosition, behavior: "smooth" });
      }, 100);
    }
  }

  async performSearch() {
    const query = document.querySelector(".search-input").value.trim();
    if (!query) {
      this.renderProducts();
      this.closeSearch();
      return;
    }

    const feed = document.getElementById("product-feed");
    this.lastScrollPosition = feed.scrollTop;

    const expandedCard = document.querySelector(".card.expanded");
    if (expandedCard) {
      this.lastExpandedIndex = parseInt(expandedCard.dataset.index);
    } else {
      this.lastExpandedIndex = null;
    }

    try {
      this.page = 1;
      this._searchQuery = query;
      await this.loadProducts(1, query);
      this.isSearching = true;
      this.updateSearchIcons();
      this.renderProducts();

      if (this.products.length === 0) {
        this.showNotification(
          `No se encontraron productos para "${query}"`,
          "warning",
        );
      } else {
        const showing = Math.min(this.products.length, this.limit);
        this.showNotification(
          `${this.totalProducts > 0 ? this.totalProducts : showing} producto(s) encontrados`,
          "success",
        );
      }
    } catch (error) {
      this.showNotification("Error en la búsqueda", "error");
    }
    this.closeSearch();
  }

  async loadCart() {
    try {
      this.cart = await API.getCart() || [];
      this.renderCart();
    } catch (error) {
      console.error("Error loading cart:", error);
    }
  }

  renderCart() {
    const container = document.getElementById("cart-items");
    const summary = document.getElementById("cart-summary");

    if (this.cart.length === 0) {
      container.innerHTML = `
                <div class="cart-empty">
                    <svg viewBox="0 0 24 24"><use href="assets/icons/cart.svg#icon"/></svg>
                    <h3>Tu carrito está vacío</h3>
                    <p>Agrega productos para comenzar tu compra</p>
                </div>
            `;
      summary.style.display = "none";
      return;
    }

    container.innerHTML = this.cart
      .map(
        (item) => `
            <div class="cart-item" data-id="${item.id}">
                <div class="cart-item-image">
                    <img src="${this.imgUrl(item.color?.imageUrl || item.product.imageUrl)}" alt="${escapeHTML(item.product.name)}" loading="lazy">
                </div>
                <div class="cart-item-details">
                    <h3 class="cart-item-name">${escapeHTML(item.product.name)}</h3>
                    <div class="cart-item-info">
                        <span class="cart-item-color">
                            ${item.color ? `<span class="color-dot" style="background: ${escapeHTML(item.color.hex)}"></span>${escapeHTML(item.color.name)}` : ""}
                            ${item.size ? `<span class="cart-item-size">Talla: ${item.size}</span>` : ""}
                        </span>
                        <span class="cart-item-price">$${Math.round(item.product.finalPrice || item.product.price).toLocaleString()}</span>
                    </div>
                    <div class="cart-item-controls">
                        <button class="quantity-btn qty-btn-minus" data-id="${item.id}"><svg viewBox="0 0 24 24" width="18" height="18"><use href="assets/icons/minus.svg#icon"/></svg></button>
                        <span class="quantity">${item.quantity || 1}</span>
                        <button class="quantity-btn qty-btn-plus" data-id="${item.id}"><svg viewBox="0 0 24 24" width="18" height="18"><use href="assets/icons/plus.svg#icon"/></svg></button>
                    </div>
                </div>
                <button class="remove-item-btn" data-id="${item.id}" aria-label="Eliminar">
                    <svg viewBox="0 0 24 24"><use href="assets/icons/close.svg#icon"/></svg>
                </button>
            </div>
        `,
      )
      .join("");

    summary.style.display = "block";

    container.querySelectorAll(".remove-item-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeFromCart(btn.dataset.id);
      });
    });

    container.querySelectorAll(".qty-btn-minus").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.updateCartQuantity(btn.dataset.id, -1);
      });
    });

    container.querySelectorAll(".qty-btn-plus").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.updateCartQuantity(btn.dataset.id, 1);
      });
    });

    this.updateCartSummary();
  }

  updateCartSummary() {
    let subtotal = 0;
    this.cart.forEach((item) => {
      subtotal += (item.product?.finalPrice || item.product?.price || 0) * (item.quantity || 1);
    });

    const subtotalEl = document.querySelector(".cart-subtotal");
    const totalEl = document.querySelector(".cart-total-amount");
    const checkoutSubtotal = document.querySelector(".checkout-subtotal");
    const checkoutTotal = document.querySelector(".checkout-total");

    if (subtotalEl) {
      subtotalEl.textContent = `$${Math.round(subtotal).toLocaleString()}`;
    }
    if (totalEl) {
      totalEl.textContent = `$${Math.round(subtotal).toLocaleString()}`;
    }
    if (checkoutSubtotal) {
      checkoutSubtotal.textContent = `$${Math.round(subtotal).toLocaleString()}`;
    }
    if (checkoutTotal) {
      checkoutTotal.textContent = `$${Math.round(subtotal).toLocaleString()}`;
    }
  }

  async removeFromCart(itemId) {
    try {
      await API.removeFromCart(itemId);
      this.cart = this.cart.filter((i) => String(i.id) !== itemId);
      this.renderCart();
      this.showNotification("Eliminado del carrito");
    } catch (error) {
      this.showNotification("Error eliminando producto");
    }
  }

  async updateCartQuantity(itemId, delta) {
    const item = this.cart.find((i) => String(i.id) === itemId);
    if (!item) return;
    const newQty = (item.quantity || 1) + delta;
    if (newQty < 1) {
      await this.removeFromCart(itemId);
      return;
    }
    try {
      await API.updateCartItem(itemId, newQty);
      item.quantity = newQty;
      this.renderCart();
    } catch (error) {
      this.showNotification("Error actualizando cantidad");
    }
  }

  async loadFavorites() {
    try {
      this.favorites = await API.getFavorites() || [];
      this.renderFavorites();
    } catch (error) {
      console.error("Error loading favorites:", error);
    }
  }

  renderFavorites() {
    const container = document.getElementById("favorites-items");
    const available = this.favorites.filter(f => f.product);

    if (available.length === 0) {
      container.innerHTML = `
                <div class="favorites-empty">
                    <svg viewBox="0 0 24 24"><use href="assets/icons/favorite.svg#icon"/></svg>
                    <h3>No tienes favoritos</h3>
                    <p>Agrega productos a favoritos para verlos aquí</p>
                </div>
            `;
      return;
    }

    container.innerHTML = available
      .map(
        (fav) => `
            <div class="favorite-item" data-id="${fav.id}" data-product-id="${fav.product.id}">
                <div class="favorite-item-image">
                    <img src="${this.imgUrl(fav.product.imageUrl)}" alt="${fav.product.name}" loading="lazy">
                </div>
                <div class="favorite-item-details">
                    <h3 class="favorite-item-name">${escapeHTML(fav.product.name)}</h3>
                    <div class="favorite-item-tag">#${escapeHTML(fav.product.category)}</div>
                    <div class="favorite-item-price">$${Math.round(fav.product.finalPrice || fav.product.price).toLocaleString()}</div>
                </div>
                <button class="remove-favorite-btn" data-id="${fav.id}" aria-label="Quitar">
                    <svg viewBox="0 0 24 24"><use href="assets/icons/close.svg#icon"/></svg>
                </button>
            </div>
        `,
      )
      .join("");

    container.querySelectorAll(".remove-favorite-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeFromFavorites(btn.dataset.id);
      });
    });

    container.querySelectorAll(".favorite-item").forEach((item) => {
      item.addEventListener("click", () => {
        const productId = item.dataset.productId;
        this.scrollToProduct(productId);
        this.closeAllOverlays();
      });
    });
  }

  scrollToProduct(productId) {
    const slides = document.querySelectorAll(".slide");
    this.products.forEach((product, index) => {
      if (String(product.id) === productId && slides[index]) {
        slides[index].scrollIntoView({ behavior: "smooth" });
        const card = slides[index].querySelector(".card");
        if (card) {
          card.classList.add("fav-highlight");
          setTimeout(() => card.classList.remove("fav-highlight"), 2000);
        }
      }
    });
  }

  async removeFromFavorites(favId) {
    try {
      await API.removeFromFavorites(favId);
      this.favorites = this.favorites.filter((f) => String(f.id) !== String(favId));
      this.renderFavorites();
      this.showNotification("Eliminado de favoritos");
    } catch (error) {
      this.showNotification("Error eliminando de favoritos");
    }
  }

  async loadUserOrders() {
    if (!this.user) {
      this.closeAllOverlays();
      document.getElementById("profile-overlay").classList.add("active");
      this.showLoginForm();
      this.showNotification("Inicia sesión para ver tus pedidos", "info");
      return;
    }
    const overlay = document.getElementById("orders-overlay");
    const content = overlay.querySelector(".menu-content");
    if (!content.querySelector("#orders-items")) {
      content.innerHTML = '<div class="orders-items" id="orders-items"></div>';
    }
    try {
      const orders = await API.getMyOrders() || [];
      this.renderOrders(orders);
      overlay.classList.add("active");
    } catch (error) {
      this.showNotification("Error cargando pedidos");
    }
  }

  renderOrders(orders) {
    const container = document.getElementById("orders-items");

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="orders-empty">
          <svg viewBox="0 0 24 24"><use href="assets/icons/profile.svg#icon"/></svg>
          <h3>No tienes pedidos</h3>
          <p>Realiza tu primer pedido para verlo aquí</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map((order) => `
      <div class="order-item" data-order-id="${order.id}">
        <div class="order-header">
          <span class="order-id">Pedido #${order.id.toString().substring(0, 8).toUpperCase()}</span>
          <span class="order-status ${order.status === 'cancelled' ? 'cancelled' : (order.paymentStatus || order.status)}">${this.getOrderStatusText(order.status === 'cancelled' ? 'cancelled' : (order.paymentStatus || order.status))}</span>
        </div>
        <div class="order-products-preview">
          ${order.items && order.items.length > 0 ? order.items.slice(0, 3).map(item => `
            <span class="order-product-preview">
              ${(() => { const img = item.colorImageUrl || item.imageUrl; return img ? `<img src="${this.imgUrl(img)}" class="order-product-thumb" alt="">` : ''; })()}
              <span>${escapeHTML(item.productName)}${item.colorName ? ` <span class="order-product-meta">(${escapeHTML(item.colorName)})</span>` : ''}${item.size ? ` <span class="order-product-meta">[${escapeHTML(item.size)}]</span>` : ''}${item.quantity > 1 ? ` x${item.quantity}` : ''}</span>
            </span>
          `).join('') : ''}
          ${order.items && order.items.length > 3 ? `<span class="order-product-preview order-product-more">+${order.items.length - 3} más</span>` : ''}
        </div>
        <div class="order-details">
          <div class="order-info">
            <strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div class="order-info">
            <strong>Método de pago:</strong> ${this.getPaymentMethodName(order.paymentMethod)}
          </div>
          <div class="order-total">Total: $${Math.round(order.total || order.total_amount).toLocaleString()}</div>
        </div>
      </div>
    `).join("");

    container.querySelectorAll(".order-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const orderId = item.dataset.orderId;
        try {
          const order = await API.getOrder(orderId);
          this.showOrderDetails(order);
        } catch (error) {
          this.showNotification("Error cargando detalles");
        }
      });
    });
  }

  showOrderDetails(order) {
    const overlay = document.getElementById("orders-overlay");
    const content = overlay.querySelector(".menu-content");
    
    content.innerHTML = `
      <div class="order-detail-header">
        <button class="back-btn" onclick="app.loadUserOrders()">
          <svg viewBox="0 0 24 24"><use href="assets/icons/back-arrow.svg#icon"/></svg>
          Volver
        </button>
        <h3>Pedido #${order.id.toString().substring(0, 8).toUpperCase()}</h3>
      </div>
      <div class="order-detail-status">
        <span class="order-status ${order.status === 'cancelled' ? 'cancelled' : (order.paymentStatus || order.status)}">${this.getOrderStatusText(order.status === 'cancelled' ? 'cancelled' : (order.paymentStatus || order.status))}</span>
      </div>
      <div class="order-detail-info">
        <p><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        <p><strong>Total:</strong> $${Math.round(order.total || order.total_amount).toLocaleString()}</p>
        <p><strong>Método de pago:</strong> ${this.getPaymentMethodName(order.paymentMethod)}</p>
      </div>
      <div class="order-detail-shipping">
        <h4>Envío</h4>
        <p>${escapeHTML(order.shippingName || '')}</p>
        <p>${escapeHTML(order.shippingAddress)}, ${escapeHTML(order.shippingCity)}</p>
        <p>Tel: ${escapeHTML(order.shippingPhone)}</p>
      </div>
      <div class="order-detail-items">
        <h4>Productos</h4>
        ${order.items ? order.items.map(item => `
          <div class="order-product-item">
            ${(() => { const img = item.colorImageUrl || item.imageUrl; return img ? `<img src="${this.imgUrl(img)}" class="order-product-img" alt="">` : ''; })()}
            <span class="order-product-name">${escapeHTML(item.productName)}${item.colorName ? ` <span class="order-product-meta">(${escapeHTML(item.colorName)})</span>` : ''}${item.size ? ` <span class="order-product-meta">[${escapeHTML(item.size)}]</span>` : ''}${item.quantity > 1 ? ` <span class="order-product-qty">x${item.quantity}</span>` : ''}</span>
            <span class="order-product-price">$${Math.round(item.productPrice || item.price).toLocaleString()}</span>
          </div>
        `).join('') : '<p>Cargando productos...</p>'}
      </div>
      ${order.status !== 'cancelled' && order.status !== 'completed' ? (() => {
        const created = new Date(order.createdAt).getTime();
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - created < oneHour) {
          return `<button class="cancel-order-btn" onclick="app.cancelOrderConfirm(${order.id})">Cancelar Pedido</button>`;
        }
        return '';
      })() : ''}
    `;
  }

  getOrderStatusText(status) {
    const statusMap = {
      'pending': 'Pendiente',
      'processing': 'Procesando',
      'completed': 'Completado',
      'cancelled': 'Cancelado',
      'paid': 'Pagado',
      'failed': 'Fallido'
    };
    return statusMap[status] || status;
  }

  cancelOrderConfirm(orderId) {
    this.showConfirmDialog(
      "Cancelar Pedido",
      "¿Seguro que deseas cancelar este pedido?",
      async () => {
        try {
          await API.cancelOrder(orderId);
          this.showNotification("Pedido cancelado", "success");
          const order = await API.getOrder(orderId);
          this.showOrderDetails(order);
        } catch (e) {
          this.showNotification("No se pudo cancelar el pedido", "error");
        }
      },
      null,
      "Sí, cancelar",
      "No, volver"
    );
  }

  async toggleFavorite() {
    if (!this.currentProduct || this._favToggling) return;
    this._favToggling = true;

    const favIcon = document.querySelector(".icon-favorite");
    const existing = this.favorites.find(
      (f) => f.product && f.product.id === this.currentProduct.id,
    );

    if (existing) {
      await this.removeFromFavorites(existing.id);
      favIcon.classList.remove("favorited");
      this._favToggling = false;
      return;
    }

    try {
      await API.addToFavorites(this.currentProduct.id);
      this.favorites.push({
        id: "fav-" + Date.now(),
        product: this.currentProduct,
      });
      favIcon.classList.add("favorited");
      this.showNotification("Agregado a favoritos");
    } catch {
      this.showNotification("Error agregando a favoritos");
    }
    this._favToggling = false;
  }

  updateFavoriteIcon() {
    if (!this.currentProduct) return;
    const favIcon = document.querySelector(".icon-favorite");
    const isFavorited = this.favorites.some(
      (f) => f.product && f.product.id === this.currentProduct.id,
    );
    if (favIcon) {
      favIcon.classList.toggle("favorited", isFavorited);
    }
  }

  openAddToCartModal() {
    if (!this.currentProduct) return;

    const modal = document.getElementById("add-to-cart-overlay");
    const product = this.currentProduct;

    modal.querySelector(".modal-product-image").src =
      this.imgUrl(product.imageUrl);
    modal.querySelector(".modal-product-image").alt = product.name;
    modal.querySelector(".modal-product-name").textContent = product.name;
    modal.querySelector(".modal-product-price").textContent =
      `$${Math.round(product.finalPrice || product.price).toLocaleString()}`;

    modal.querySelector(".modal-color-options").innerHTML = product.colors
      .map(
        (color, i) => `
            <button class="color-option"
                    data-color-id="${color.id}"
                    data-hex="${escapeHTML(color.hex)}"
                    style="background: ${escapeHTML(color.hex)}"
                    aria-label="${escapeHTML(color.name)}"></button>
        `,
      )
      .join("");

    modal.querySelector(".modal-size-options").innerHTML = (product.sizes || [])
      .map(
        (size, i) => `
            <button class="size-option"
                    data-size="${escapeHTML(size)}">${escapeHTML(size)}</button>
        `,
      )
      .join("");

    this.selectedColor = null;
    this.selectedSize = null;
    this.selectedQuantity = 1;
    const qtySpan = modal.querySelector(".modal-quantity");
    if (qtySpan) qtySpan.textContent = "1";

    modal.querySelectorAll(".modal-color-options .color-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) {
          btn.classList.remove("active");
          this.selectedColor = null;
          modal.querySelector(".modal-product-image").src =
            this.imgUrl(product.imageUrl);
          return;
        }
        modal
          .querySelectorAll(".modal-color-options .color-option")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const color = product.colors.find((c) => String(c.id) === btn.dataset.colorId);
        this.selectedColor = color;
        modal.querySelector(".modal-product-image").src =
          this.imgUrl(color.imageUrl || product.imageUrl);
      });
    });

    modal.querySelectorAll(".modal-size-options .size-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) {
          btn.classList.remove("active");
          this.selectedSize = null;
          return;
        }
        modal
          .querySelectorAll(".modal-size-options .size-option")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedSize = btn.dataset.size;
      });
    });

    modal.querySelectorAll(".modal-qty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.action === "plus") this.selectedQuantity++;
        else if (btn.dataset.action === "minus" && this.selectedQuantity > 1) this.selectedQuantity--;
        if (qtySpan) qtySpan.textContent = this.selectedQuantity;
      });
    });

    modal.classList.add("active");
  }

  closeAddToCartModal() {
    document.getElementById("add-to-cart-overlay").classList.remove("active");
  }

  async confirmAddToCart() {
    if (!this.currentProduct) return;
    if (!this.selectedColor || !this.selectedSize) {
      this.showNotification("Selecciona un color y una talla", "error");
      return;
    }

    if (!this.user) {
      this.pendingPurchase = { productId: this.currentProduct.id };
      sessionStorage.setItem('pendingPurchase', JSON.stringify(this.pendingPurchase));
      this.closeAddToCartModal();
      this.showConfirmDialog(
        "Mi cuenta",
        "Debes iniciar sesión o registrarte antes de comprar.",
        () => {
          this.collapseCard();
          this.closeAllOverlays();
          document.getElementById("profile-overlay").classList.add("active");
          this.showProfileOptions();
        },
        () => { this.pendingPurchase = null; sessionStorage.removeItem('pendingPurchase'); },
        "Aceptar",
        "Cancelar",
      );
      return;
    }

    try {
      await API.addToCart(
        this.currentProduct.id,
        this.selectedColor.id,
        this.selectedSize || '',
        this.selectedQuantity || 1,
      );
      this.showNotification("Agregado al carrito");
      this.closeAddToCartModal();

      if (document.body.classList.contains("expanded-mode")) {
        this.collapseCard();
      }
      setTimeout(() => {
        this.loadCart();
        document.getElementById("cart-overlay").classList.add("active");
      }, 300);
    } catch (error) {
      if (error.message?.includes("iniciar sesión")) {
        this.pendingPurchase = { productId: this.currentProduct.id };
        sessionStorage.setItem('pendingPurchase', JSON.stringify(this.pendingPurchase));
        this.closeAddToCartModal();
        this.showConfirmDialog(
          "Mi cuenta",
          "Debes iniciar sesión o registrarte antes de comprar.",
          () => {
            this.closeAllOverlays();
            document.getElementById("profile-overlay").classList.add("active");
            this.showProfileOptions();
          },
          () => { this.pendingPurchase = null; sessionStorage.removeItem('pendingPurchase'); },
          "Aceptar",
          "Cancelar",
        );
      } else {
        this.showNotification(error.message || "Error agregando al carrito", "error");
      }
    }
  }

  addCurrentToCart() {
    if (!this.currentProduct) return;

    if (!this.user) {
      this.pendingPurchase = { productId: this.currentProduct.id };
      sessionStorage.setItem('pendingPurchase', JSON.stringify(this.pendingPurchase));
      this.showConfirmDialog(
        "Mi cuenta",
        "Debes iniciar sesión o registrarte antes de comprar.",
        () => {
          this.collapseCard();
          this.closeAllOverlays();
          document.getElementById("profile-overlay").classList.add("active");
          this.showProfileOptions();
        },
        () => { this.pendingPurchase = null; sessionStorage.removeItem('pendingPurchase'); },
        "Aceptar",
        "Cancelar",
      );
      return;
    }

    const card = document.querySelector(".card.expanded");
    const activeColorBtn = card
      ? card.querySelector(".color-option.active")
      : null;
    const activeSizeBtn = card
      ? card.querySelector(".size-option.active")
      : null;

    if (!activeColorBtn || !activeSizeBtn) {
      this.showNotification("Selecciona un color y una talla", "error");
      return;
    }

    let selectedColor = null;
    if (activeColorBtn) {
      const colorId = activeColorBtn.dataset.colorId;
      selectedColor = this.currentProduct.colors.find((c) => String(c.id) === colorId);
    }

    if (!selectedColor) return;

    const selectedSize = activeSizeBtn
      ? activeSizeBtn.dataset.size
      : null;

    API.addToCart(this.currentProduct.id, selectedColor.id, selectedSize || '')
      .then(() => {
        this.showNotification("Agregado al carrito");
        this.collapseCard();
        setTimeout(() => {
          this.loadCart();
          document.getElementById("cart-overlay").classList.add("active");
        }, 300);
      })
      .catch((err) => {
        this.showNotification(err.message || "Error agregando al carrito", "error");
      });
  }

  resumePendingPurchase() {
    const pp = this.pendingPurchase || JSON.parse(sessionStorage.getItem('pendingPurchase') || 'null');
    if (!pp || !this.user) return;
    this.pendingPurchase = null;
    sessionStorage.removeItem('pendingPurchase');
    const card = document.querySelector(`.card[data-product-id="${pp.productId}"]`);
    if (!card) return;
    this.expandCard(card);
    setTimeout(() => this.openAddToCartModal(), 300);
  }

  async autoSaveProfile(data) {
    try {
      await API.updateProfile(data);
      Object.assign(this.user, data);
    } catch (e) {
      console.warn('autoSaveProfile error:', e);
    }
  }

  setupCheckoutAutoSave() {
    if (this._checkoutAutoSaveSetup) return;
    this._checkoutAutoSaveSetup = true;
    const fields = ['checkout-address', 'checkout-city', 'checkout-phone'];
    const map = {
      'checkout-address': 'address',
      'checkout-city': 'city',
      'checkout-phone': 'phone',
    };
    let timer;
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const data = {};
          fields.forEach((fid) => {
            const val = document.getElementById(fid).value.trim();
            if (val) data[map[fid]] = val;
          });
          this.autoSaveProfile(data);
        }, 600);
      });
    });
  }

  async openCheckout() {
    this.closeAllOverlays();

    if (this.user) {
      document.getElementById("checkout-name").value = this.user.username || "";
      document.getElementById("checkout-address").value = this.user.address || "";
      document.getElementById("checkout-city").value = this.user.city || "";
      document.getElementById("checkout-phone").value = this.user.phone || "";
    }

    this.setupCheckoutAutoSave();
    await this.loadPaymentMethods();
    this.updateCartSummary();
    document.getElementById("checkout-overlay").classList.add("active");
  }

  async loadPaymentMethods() {
    const container = document.getElementById("checkout-payment-methods");
    if (!container) return;

    try {
      const methods = await API.request("/payment-methods");
      container.innerHTML = methods.map((m, i) => {
        const iconMap = { nequi: "nequi", daviplata: "daviplata", boton_bancolombia: "bancolombia" };
        const viewBoxMap = { nequi: "0 0 180.8 56", daviplata: "0 0 50 41", boton_bancolombia: "0 0 110.54 110.83" };
        const icon = iconMap[m.name] || "help";
        const vb = icon === "help" ? "0 0 24 24" : (viewBoxMap[m.name] || "0 0 24 24");

        let svgContent = "";
        if (icon === "nequi") {
          svgContent = `<path fill="currentColor" d="M9.2,0H1.6C0.7,0,0,0.7,0,1.6v6.5C0,9,0.7,9.7,1.6,9.7h7.6c0.9,0,1.6-0.7,1.6-1.6V1.6C10.8,0.7,10.1,0,9.2,0z"/><path fill="currentColor" d="M55.6,0h-6.6c-0.9,0-1.6,0.7-1.6,1.6v26.2c0,0.5-0.7,0.7-1,0.3L31.3,0.7C31,0.3,30.6,0,30,0H19.2c-0.9,0-1.6,0.7-1.6,1.6v41.9c0,0.9,0.7,1.6,1.6,1.6h6.6c0.9,0,1.6-0.7,1.6-1.6v-27c0-0.5,0.7-0.7,1-0.3l15.7,28.2c0.3,0.4,0.7,0.7,1.2,0.7h10.4c0.9,0,1.6-0.7,1.6-1.6V1.6C57.1,0.7,56.4,0,55.6,0L55.6,0z"/><path fill="currentColor" d="M95,28.7c0-11.8-7.7-17.7-16.1-17.7c-10.9,0-17.2,7.6-17.2,17.9c0,11.7,7.8,17.2,16.9,17.2s14.4-4.7,15.8-10.8c0.2-0.8-0.3-1.5-1.4-1.5h-5.2c-0.6,0-1.1,0.3-1.3,0.9c-1.3,2.8-3.4,4.3-7.3,4.3c-4.5,0-7.5-2.8-8-8.6h22.1C94.4,30.5,95,29.8,95,28.7z M71.6,24.3c1-4.2,3.4-6.1,7.1-6.1c3.3,0,6.2,1.9,6.6,6.1H71.6z"/><path fill="currentColor" d="M179.2,11.9h-6.6c-0.9,0-1.6,0.7-1.6,1.6v30c0,0.9,0.7,1.6,1.6,1.6h6.6c0.9,0,1.6-0.7,1.6-1.6v-30C180.8,12.6,180.1,11.9,179.2,11.9z"/><path fill="currentColor" d="M130.3,11.9h-6.6c-0.9,0-1.6,0.7-1.6,1.6v1.6c-2-2.3-5.2-3.9-9.4-3.9c-9.5,0-14.5,8.6-14.5,17.7c0,7.9,4.1,16.8,14.3,16.8c3.6,0,7.5-1.7,9.6-4.2v12.9c0,0.9,0.7,1.6,1.6,1.6h6.6c0.9,0,1.6-0.7,1.6-1.6V13.5C131.9,12.6,131.2,11.9,130.3,11.9L130.3,11.9z M115.4,38.7c-4.3,0-7.3-3.2-7.3-10s3-10.4,7.3-10.4s7.3,3.3,7.3,10.4C122.8,35.8,119.7,38.7,115.4,38.7z"/><path fill="currentColor" d="M165.2,11.9h-6.6c-0.9,0-1.6,0.7-1.6,1.6v17c0,5.5-2.4,7.1-5.5,7.1c-3.1,0-5.5-1.6-5.5-7.1v-17c0-0.9-0.7-1.6-1.6-1.6h-6.6c-0.9,0-1.6,0.7-1.6,1.6v17.7c0,10.5,5.8,14.7,15.3,14.7c9.5,0,15.3-4.3,15.3-14.7V13.5C166.9,12.6,166.2,11.9,165.2,11.9L165.2,11.9z"/>`;
        } else if (icon === "bancolombia") {
          svgContent = `<path fill="currentColor" d="M82.66,0.03c-21.47,2.65-42.21,6.56-63,12.59c-2.71,0.85-4.37,3.88-3.69,6.57c1.52,5.99,2.29,8.99,3.83,15c0.65,2.54,3.21,3.84,5.8,2.98c21.24-6.54,42.53-11.01,64.51-14.27c2.52-0.34,3.89-2.94,2.97-5.55c-1.95-5.51-2.93-8.25-4.92-13.73C87.3,1.3,85.01-0.23,82.66,0.03z M100.62,33.37c-33.61,4.29-66.35,12.6-97.39,26.34c-2.26,1.07-3.62,3.92-3.14,6.43c1.22,6.42,1.83,9.64,3.07,16.07c0.53,2.75,3.1,4.02,5.63,2.78c31.53-14.45,64.84-23.64,99.01-29.12c2.17-0.36,3.28-2.85,2.45-5.41c-1.72-5.32-2.59-7.98-4.37-13.27C105.07,34.73,102.84,33.08,100.62,33.37z M100.22,69.19c-20.99,4.56-41.51,10.05-61.83,17.03c-2.58,0.95-4.03,3.66-3.35,6.17c1.62,5.96,2.42,8.95,4.06,14.93c0.77,2.81,3.93,4.25,6.83,3.14c20.31-7.28,40.83-13.63,61.79-18.73c2.01-0.49,3-2.85,2.26-5.28c-1.65-5.37-2.48-8.05-4.18-13.39C104.97,70.43,102.53,68.71,100.22,69.19z"/>`;
        } else if (icon === "daviplata") {
          svgContent = `<path fill="currentColor" d="M12.3535 17.4629C12.3776 17.3699 12.3937 17.2787 12.4104 17.1876C12.4271 17.1048 12.4431 17.0226 12.4561 16.9366C12.5 16.6073 12.5081 16.2934 12.4846 15.9988C12.4827 15.9815 12.4802 15.9642 12.4784 15.9468C12.471 15.8653 12.4574 15.7864 12.445 15.7068C12.3553 15.1939 12.2008 14.7285 11.9874 14.31C11.9825 14.3004 11.9769 14.2927 11.9726 14.2831C11.9163 14.1752 11.8557 14.0725 11.792 13.9711C11.7494 13.9031 11.7073 13.8383 11.6634 13.776C11.6344 13.7336 11.6034 13.6913 11.5731 13.6502C11.5107 13.5648 11.4495 13.4859 11.3889 13.4127C11.3209 13.3325 11.2522 13.2522 11.1805 13.1765C11.165 13.1604 11.1508 13.1437 11.1354 13.129C8.38623 10.3092 2.39762 10.5974 0.68606 11.3465C-0.471469 11.8516 -0.0720232 13.3414 1.19557 12.7599C3.25773 12.2182 5.24692 12.2291 7.28249 12.7599C8.94397 13.1925 10.6858 14.7022 10.6858 16.3236C10.5671 20.361 5.42191 20.5215 3.33626 19.9958V14.9731C3.33626 13.7741 1.84915 13.7644 1.84915 14.9635V20.0138C1.84915 21.0273 2.3531 21.3951 3.01905 21.5536C4.58963 21.9266 11.1811 22.3252 12.3522 17.4629H12.3535Z"/><path fill="currentColor" d="M40.1317 20.7905V11.9357C40.1311 10.5358 38.4368 10.5435 38.4368 11.9126V20.7404C38.4368 22.0639 40.1317 22.114 40.1317 20.7905Z"/><path fill="currentColor" d="M35.8887 11.4254C35.1491 13.6104 32.6127 19.7115 31.0768 19.7275C29.539 19.7429 26.9166 13.6951 26.1362 11.5243C25.6675 10.2232 24.2367 11.1687 24.7042 12.4698C25.5433 14.8043 28.6955 21.8444 31.1108 21.7565C33.5241 21.795 36.5423 14.6913 37.3387 12.3408C37.7814 11.0307 36.3351 10.1147 35.8881 11.4254H35.8887Z"/><path fill="currentColor" d="M19.4786 10.8452C16.8649 10.7682 13.4912 17.8192 12.5971 20.1576C12.095 21.4619 13.6483 22.3996 14.1504 21.096C14.9808 18.9239 17.8177 12.8658 19.4817 12.8748C21.1432 12.8851 23.8855 18.9765 24.6955 21.157C25.1815 22.4664 26.7447 21.5466 26.2574 20.2365C25.3881 17.8885 22.0886 10.7983 19.4786 10.8445V10.8452Z"/><path fill="currentColor" d="M47.1857 11.4839C45.9682 10.419 43.9963 8.88103 43.1331 8.21412C43.2259 7.25259 43.3934 6.23457 43.6012 5.37959C43.8621 4.31792 44.0847 3.11119 43.4182 2.22026C42.9717 1.62395 42.2662 1.33382 41.2614 1.33382H37.795C36.8292 1.33382 36.1113 1.64513 35.6624 2.25813C35.4806 2.50654 35.3557 2.79217 35.2895 3.10605C31.6951 1.13484 28.6554 0.00962818 26.8659 0C23.8366 0.016047 16.6355 3.64138 10.4719 8.25392C10.2344 8.43172 10.1813 8.77512 10.3519 9.02096C10.5226 9.2668 10.854 9.32265 11.0908 9.14549C17.7101 4.19147 24.4358 1.11173 26.8659 1.0989C28.5774 1.10852 31.8175 2.37559 35.5325 4.4893L36.4569 5.01564L36.311 3.93151C36.256 3.52006 36.3227 3.17152 36.5052 2.92247C36.7432 2.59704 37.1767 2.43208 37.7944 2.43208H41.2608C41.9169 2.43208 42.3491 2.58292 42.5816 2.89359C42.955 3.39233 42.7831 4.26015 42.5741 5.10871C42.3311 6.11197 42.1401 7.32063 42.0504 8.42466L42.0257 8.73019L42.2631 8.91249C42.9229 9.41957 45.1773 11.1642 46.5031 12.3241C48.4892 14.0616 49.2844 15.6509 48.8033 16.9193C48.2839 18.2878 46.1976 19.1145 43.6074 18.9771C43.2729 18.9605 42.9421 18.9438 42.6168 18.9264L42.0183 18.895L42.0622 19.5157C42.1735 21.0992 42.7207 23.5634 44.6926 26.3106L44.7105 26.3344C46.8085 28.9423 47.1257 32.0901 45.5595 34.7532C43.6989 37.9164 39.0601 40.4769 32.8897 39.0667L32.75 39.0346L32.6139 39.0801C30.822 39.6777 28.1403 39.9005 26.8708 39.9005C25.6014 39.9005 22.919 39.6777 21.1289 39.0801L20.9929 39.0346L20.8532 39.0667C14.6815 40.4769 10.0415 37.9158 8.18094 34.7526C6.61469 32.0894 6.93189 28.9423 9.02991 26.3344C9.21727 26.1014 9.18759 25.7547 8.96313 25.5603C8.73868 25.3658 8.40478 25.3966 8.21742 25.6296C5.81518 28.6162 5.46334 32.2409 7.27754 35.3252C8.38004 37.2001 10.2295 38.731 12.484 39.636C15.0092 40.6495 17.9309 40.8338 20.9428 40.1713C22.8442 40.7741 25.5692 41 26.8714 41C28.1737 41 30.8987 40.7741 32.8013 40.1713C34.0201 40.4396 35.1838 40.5622 36.285 40.5622C41.1575 40.5622 44.7983 38.1578 46.4635 35.3258C48.2752 32.2454 47.9271 28.6259 45.5335 26.2826C45.3137 26.0647 44.9626 26.0557 44.7322 26.2621L44.0091 26.8752C42.2958 28.3521 39.4485 28.8722 36.9497 28.1788C34.4822 27.4922 32.8264 25.6019 31.8172 23.8497C31.6255 23.5208 30.6562 20.3077 30.446 19.3808C30.3327 18.8789 30.2542 18.8705 30.0785 18.8705C29.1804 20.4039 28.0469 22.6027 27.2725 23.868C26.8193 24.6163 26.4544 25.3443 26.1968 25.8526C25.8004 26.6433 24.4989 27.8552 22.9074 28.6317C21.5124 29.311 18.7993 30.137 15.5441 29.7338C14.9985 29.659 14.509 29.5404 14.0754 29.3709C13.7205 29.2335 13.3662 29.0961 13.015 28.9587C12.1357 28.6292 11.2206 28.2061 10.1969 27.4572C9.50352 26.9563 8.32373 25.5934 8.03039 23.5831C8.02912 23.5717 8.02719 23.5608 8.02527 23.5494C7.59742 21.0531 8.54918 19.4212 9.05198 18.7538L9.14226 18.6235C9.3785 18.2865 9.60671 17.9563 9.80285 17.6355C9.94076 17.4038 10.0174 17.1312 10.0284 16.8525L10.0303 16.7923C10.0525 16.1491 9.85704 15.5165 9.48367 15.0059L9.42139 14.9225C8.1166 13.1801 4.75403 12.5774 1.99072 13.4917C1.98264 13.4941 1.97298 13.497 1.96331 13.5L1.96395 13.5013C1.95428 13.5048 1.94461 13.5078 1.93654 13.5108C0.317275 14.1005 -0.215636 12.0631 1.29541 11.3406C2.78589 10.4285 7.95183 8.79711 11.8354 10.9234C13.242 11.7141 14.1095 13.0108 14.6626 14.5223L12.3535 17.4629Z"/><path fill="currentColor" d="M14.3365 35.1794V32.3083C14.739 32.4027 15.1416 32.4431 15.5441 32.4431C17.4789 32.4431 19.0241 31.2974 19.0241 28.588C19.0241 26.1752 17.8425 25.0833 16.3752 25.0833C15.4792 25.0833 14.7131 25.5551 14.2066 26.2695C14.1287 25.8786 14.0119 25.5551 13.8171 25.2316H13.012C13.0899 26.1213 13.1029 26.8357 13.1029 27.5231V35.1794H14.3365ZM14.3365 26.8215C14.8559 26.498 15.4792 26.2554 16.0635 26.2554C17.1413 26.2554 17.8165 26.8485 17.8165 28.6817C17.8165 30.8249 16.7387 31.3641 15.5571 31.3641C15.1935 31.3641 14.765 31.3237 14.3365 31.2024V26.8215Z"/><path fill="currentColor" d="M20.2892 22.1981V30.5284C20.2892 31.9707 20.9515 32.456 21.9124 32.456C22.224 32.456 22.5746 32.4155 22.9642 32.3077V31.2158C22.6525 31.2698 22.3928 31.3237 22.198 31.3237C21.7046 31.3237 21.5228 31.0676 21.5228 30.3397V22.1981H20.2892Z"/><path fill="currentColor" d="M23.6103 30.7447C23.6103 31.9039 24.4024 32.4431 25.3503 32.4431C26.3891 32.4431 27.2202 31.877 27.5838 30.8391C27.6617 31.4591 27.8045 31.85 27.9863 32.2948H28.7914C28.6745 31.3378 28.6615 30.7043 28.6615 30.0438V27.9814C28.6615 25.9191 27.5318 25.0833 25.9217 25.0833C25.3114 25.0833 24.6362 25.2046 23.922 25.4338V26.5526C24.5582 26.4043 25.2075 26.256 25.7918 26.256C26.7008 26.256 27.4929 26.5526 27.5059 27.8197C26.3891 28.7632 23.6103 28.4128 23.6103 30.7447ZM27.5059 28.8171V29.3294C27.5059 30.583 26.48 31.4052 25.61 31.4052C25.1036 31.4052 24.779 31.1491 24.779 30.6234C24.779 29.3294 26.3891 29.6259 27.5059 28.8171Z"/><path fill="currentColor" d="M32.7908 32.4431C33.3102 32.4431 33.8815 32.3353 34.5308 32.1331V31.0278C33.9595 31.1895 33.4401 31.2704 33.0115 31.2704C32.2065 31.2704 31.726 30.9065 31.726 29.7203V26.2426H34.388V25.2316H31.726V23.2097H30.5574V25.2855C30.0769 25.3529 29.6354 25.4608 29.2848 25.5956V26.2426H30.4924V29.7068C30.4924 31.6074 31.3235 32.4431 32.7908 32.4431Z"/><path fill="currentColor" d="M35.5238 25.4332V26.552C36.1601 26.4037 36.8094 26.2554 37.3937 26.2554C38.3027 26.2554 39.0948 26.552 39.1077 27.819C37.991 28.7626 35.2122 28.4121 35.2122 30.7441C35.2122 31.9033 36.0043 32.4425 36.9522 32.4425C37.991 32.4425 38.8221 31.8763 39.1857 30.8384C39.2636 31.4585 39.4064 31.8494 39.5882 32.2942H40.3933C40.2764 31.3372 40.2634 30.7036 40.2634 30.0431V27.9808C40.2634 25.9184 39.1337 25.0827 37.5236 25.0827C36.9133 25.0827 36.238 25.204 35.5238 25.4332ZM39.1084 29.3294C39.1084 30.5829 38.0825 31.4052 37.2125 31.4052C36.7061 31.4052 36.3815 31.1491 36.3815 30.6234C36.3815 29.3294 37.9916 29.6259 39.1084 28.8171V29.3294Z"/>`;
        } else {
          svgContent = `<use href="assets/icons/${icon}.svg#icon"/>`;
        }

        return `
        <label class="payment-option ${i === 0 ? "active" : ""}" data-method="${m.name}">
          <input type="radio" name="payment_method" value="${m.name}" ${i === 0 ? "checked" : ""} hidden>
          <span class="payment-option-content">
            <svg viewBox="${vb}" width="24" height="24">${svgContent}</svg>
            <div>
              <span class="payment-name">${this.getPaymentMethodName(m.name)}</span>
              <p class="payment-desc">${escapeHTML(m.description || "")}</p>
            </div>
          </span>
        </label>`;
      }).join("");

      container.querySelectorAll(".payment-option").forEach((opt) => {
        opt.addEventListener("click", () => {
          container.querySelectorAll(".payment-option").forEach((o) => o.classList.remove("active"));
          opt.classList.add("active");
        });
      });
    } catch (e) {
      console.warn('loadPaymentMethods error:', e);
      container.innerHTML = `
        <label class="payment-option active" data-method="Contra Entrega">
          <input type="radio" name="payment_method" value="Contra Entrega" checked hidden>
          <span class="payment-option-content">
            <svg viewBox="0 0 24 24" width="24" height="24"><use href="assets/icons/help.svg#icon"/></svg>
            <div>
              <span class="payment-name">Pago Contra Entrega</span>
              <p class="payment-desc">Pagas en efectivo cuando recibes tu pedido</p>
            </div>
          </span>
        </label>`;
    }
  }

  getMissingPurchaseData() {
    if (!this.user) return [];
    const labels = [];
    if (!this.user.postalCode) labels.push("Código Postal");
    if (!this.user.country) labels.push("País");
    if (!this.user.documentType) labels.push("Tipo de Documento");
    if (!this.user.documentNumber) labels.push("Número de Documento");
    return labels;
  }

  async confirmOrder() {
    if (!this.user) {
      this.showNotification("Inicia sesión para confirmar tu pedido", "error");
      return;
    }

    const subtotal = this.cart.reduce(
      (sum, item) => sum + (item.product.finalPrice || item.product.price) * (item.quantity || 1),
      0,
    );

    if (subtotal === 0) {
      this.showNotification("Tu carrito está vacío", "error");
      return;
    }

    this.finalizeOrder();
  }

  async finalizeOrder() {
    const subtotal = this.cart.reduce(
      (sum, item) => sum + (item.product?.finalPrice || item.product?.price || 0) * (item.quantity || 1), 0,
    );

    const name = document.getElementById("checkout-name").value.trim();
    const address = document.getElementById("checkout-address").value.trim();
    const city = document.getElementById("checkout-city").value.trim();
    const phone = document.getElementById("checkout-phone").value.trim();

    const missing = [];
    if (!name) missing.push("Nombre");
    if (!address) missing.push("Dirección");
    if (!city) missing.push("Ciudad");
    if (!phone) missing.push("Teléfono");

    if (missing.length > 0) {
      this.showNotification(`Completa los campos obligatorios: ${missing.join(", ")}`, "error");
      return;
    }

    const selectedPayment = document.querySelector(".payment-option.active");
    const paymentMethod = selectedPayment
      ? selectedPayment.dataset.method
      : "cash_on_delivery";

    const missingProfile = this.getMissingPurchaseData();
    if (missingProfile.length > 0) {
      this._pendingOrder = { shippingName: name, shippingAddress: address, shippingCity: city, shippingPhone: phone, paymentMethod };
      this.showConfirmDialog(
        "Faltan datos de perfil",
        `Faltan: ${missingProfile.join(", ")}. ¿Quieres llenarlos ahora?`,
        () => {
          this._returnToCheckout = true;
          document.getElementById("checkout-overlay").classList.remove("active");
          this.openProfileEdit();
        },
        () => {
          this.showOrderConfirm(name, address, city, phone, paymentMethod);
        }
      );
      return;
    }

    this.showOrderConfirm(name, address, city, phone, paymentMethod);
  }

  showOrderConfirm(name, address, city, phone, paymentMethod) {
    const subtotal = this.cart.reduce(
      (sum, item) => sum + (item.product?.finalPrice || item.product?.price || 0) * (item.quantity || 1), 0,
    );
    const paymentName = document.querySelector(".payment-option.active .payment-name");
    const paymentLabel = paymentName ? paymentName.textContent : "Pago contra entrega";

    document.getElementById("confirm-total").textContent = `$${Math.round(subtotal).toLocaleString()}`;
    document.getElementById("confirm-address").textContent = `${address}, ${city}`;
    document.getElementById("confirm-phone").textContent = phone;
    document.getElementById("confirm-payment").textContent = paymentLabel;

    document.getElementById("confirm-order-overlay").classList.add("active");
    this._pendingOrder = {
      shippingName: name,
      shippingAddress: address,
      shippingCity: city,
      shippingPhone: phone,
      paymentMethod: paymentMethod,
    };
  }

  hidePaymentLoading() {
    document.getElementById("payment-loading-overlay").classList.remove("active");
  }

  async submitOrder() {
    if (!this._pendingOrder) return;
    const orderData = this._pendingOrder;
    this._pendingOrder = null;
    document.getElementById("confirm-order-overlay").classList.remove("active");

    const isPayment = ["nequi", "daviplata", "boton_bancolombia"].includes(orderData.paymentMethod);
    if (isPayment) {
      document.getElementById("payment-loading-overlay").classList.add("active");
    }

    const minDelay = new Promise((r) => setTimeout(r, 2000));

    let order;
    try {
      order = await API.createOrder(orderData);
      if (!isPayment) {
        await this.clearCart();
      }
    } catch (error) {
      await minDelay;
      this.hidePaymentLoading();
      this.showNotification(error.message || "Error creando el pedido", "error");
      return;
    }

    try {
      if (orderData.paymentMethod === "nequi") {
        const phone = orderData.shippingPhone;
        const [payment] = await Promise.all([API.createNequiPayment(order.id, phone), minDelay]);
        this.hidePaymentLoading();
        this.showPaymentPending(payment, order.id, "nequi");
      } else if (orderData.paymentMethod === "daviplata") {
        const phone = orderData.shippingPhone;
        const docType = this.user?.documentType || "CC";
        const docNumber = this.user?.documentNumber || "";
        const [payment] = await Promise.all([API.createDaviplataPayment(order.id, phone, docType, docNumber), minDelay]);
        this.hidePaymentLoading();
        this.showPaymentPending(payment, order.id, "daviplata");
      } else if (orderData.paymentMethod === "boton_bancolombia") {
        const [payment] = await Promise.all([API.createBancolombiaTransferPayment(order.id), minDelay]);
        this.hidePaymentLoading();
        if (payment.redirectUrl) {
          window.location.href = payment.redirectUrl;
        } else {
          this.showNotification("Error: no se obtuvo URL de pago", "error");
          await API.cancelOrder(order.id);
          await this.loadCart();
          document.getElementById("cart-overlay").classList.add("active");
        }
      } else {
        this.showNotification("Pedido confirmado. Gracias por tu compra", "success");
        this.closeAllOverlays();
        await this.loadProducts();
        this.renderProducts();
      }
    } catch (error) {
      this.hidePaymentLoading();
      this.showNotification(error.message || "Error al procesar el pago", "error");
      await API.cancelOrder(order.id).catch(() => {});
      await this.loadCart();
    }
  }

  showPaymentPending(payment, orderId, method) {
    this.closeAllOverlays();

    const names = { nequi: "Nequi", daviplata: "DaviPlata" };
    const label = names[method] || method || "Nequi";

    document.getElementById("payment-pending-title").textContent = "Pago con " + label;
    document.getElementById("payment-pending-msg").textContent = "Revisa tu app " + label + " para confirmar el pago";
    document.getElementById("payment-method-type").value = label;

    const overlay = document.getElementById("payment-pending-overlay");
    document.getElementById("payment-ref").textContent = payment.reference || "";
    document.getElementById("payment-transaction-id").textContent = payment.transactionId || "";
    document.getElementById("payment-order-id").textContent = orderId;
    overlay.classList.add("active");
  }

  async checkNequiPayment() {
    const orderId = document.getElementById("payment-order-id").textContent;
    if (!orderId) return;

    const btn = document.querySelector(".check-payment-btn");
    btn.disabled = true;
    btn.textContent = "Verificando...";

    try {
      const result = await API.checkPaymentStatus(orderId);
      const pendingOverlay = document.getElementById("payment-pending-overlay");

      if (result.wompiStatus === "APPROVED") {
        pendingOverlay.classList.remove("active");
        await this.clearCart();
        this.showNotification("Pago confirmado. Gracias por tu compra", "success");
        await this.loadProducts();
        this.renderProducts();
      } else if (result.wompiStatus === "DECLINED") {
        pendingOverlay.classList.remove("active");
        API.cancelOrder(orderId).catch(() => {});
        await this.loadCart();
        document.getElementById("cart-overlay").classList.add("active");
        this.showNotification("Pago rechazado. Intenta de nuevo", "error");
      } else {
        const pmType = document.getElementById("payment-method-type").value || "Nequi";
        this.showNotification("Pago pendiente, revisa tu app " + pmType, "info");
      }
    } catch (e) {
      this.showNotification("Error verificando pago", "error");
    }

    btn.disabled = false;
    btn.textContent = "Ya pagué, verificar";
  }

  async clearCart() {
    this.cart = [];
    this.renderCart();
    await API.clearCart().catch(() => {});
  }

  getPaymentMethodName(method) {
    const names = { cash_on_delivery: "Pago contra entrega", transfer: "Transferencia bancaria", card: "Tarjeta", paypal: "PayPal", nequi: "Nequi", daviplata: "DaviPlata", boton_bancolombia: "Bancolombia" };
    return names[method] || method || "Pago contra entrega";
  }

  showProfileOptions() {
    document.getElementById("profile-options").style.display = "";
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("password-reset-form").style.display = "none";
    document.getElementById("profile-logged-in").style.display = "none";
    document.getElementById("reset-step-1").style.display = "block";
    document.getElementById("reset-step-2").style.display = "none";
    document.getElementById("reset-step-3").style.display = "none";
  }

  showLoggedInPanel() {
    document.getElementById("profile-options").style.display = "none";
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("profile-logged-in").style.display = "";
  }

  backFromPanel(panelId) {
    document.getElementById(panelId).classList.remove("active");
    document.getElementById("profile-overlay").classList.add("active");
    setTimeout(() => {
      if (this.user) {
        this.updateLoggedInUI();
      } else {
        this.showProfileOptions();
      }
    }, 50);
  }

  showLoginForm() {
    document.getElementById("register-form").style.display = "none";
    document.getElementById("profile-options").style.display = "none";
    document.getElementById("password-reset-form").style.display = "none";
    document.getElementById("login-form").style.display = "";
  }

  showRegisterForm() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("profile-options").style.display = "none";
    document.getElementById("register-form").style.display = "";
  }

  showPasswordReset() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("password-reset-form").style.display = "";
    document.getElementById("reset-step-1").style.display = "block";
    document.getElementById("reset-step-2").style.display = "none";
    document.getElementById("reset-step-3").style.display = "none";
    this._resetEmail = "";
  }

  async handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById("reset-email").value.trim();
    const btn = e.target.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      const q = await API.getEmailQuota();
      if (!q.available) {
        this.showNotification("Límite de correos alcanzado. Inténtalo en 24 horas.", "warning");
        btn.disabled = false;
        btn.textContent = "Enviar Código";
        return;
      }
      const res = await API.forgotPassword(email);
      this._resetEmail = email;
      if (res.code) {
        document.getElementById("reset-code").value = res.code;
      }
      document.getElementById("reset-step-1").style.display = "none";
      document.getElementById("reset-step-2").style.display = "block";
      this.showNotification("Código enviado", "success");
    } catch (err) {
      this.showNotification(err.message || "Error al enviar código", "error");
    }
    btn.disabled = false;
    btn.textContent = "Enviar Código";
  }

  async handleVerifyResetCode(e) {
    e.preventDefault();
    const code = document.getElementById("reset-code").value.trim();
    if (!this._resetEmail) {
      this.showNotification("Debes solicitar un código primero", "error");
      return;
    }
    const btn = e.target.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "Verificando...";
    try {
      await API.verifyResetCode(this._resetEmail, code);
      document.getElementById("reset-step-2").style.display = "none";
      document.getElementById("reset-step-3").style.display = "block";
      this.showNotification("Código válido", "success");
    } catch (err) {
      this.showNotification(err.message || "Código inválido", "error");
    }
    btn.disabled = false;
    btn.textContent = "Verificar";
  }

  async handleSetPassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById("set-new-password").value;
    if (newPassword.length < 6) {
      this.showNotification("La contraseña debe tener al menos 6 caracteres", "error");
      return;
    }
    const btn = e.target.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "Guardando...";
    try {
      await API.setPassword(newPassword);
      this.closeAllOverlays();
      this.user.hasPassword = true;
      this.updateLoggedInUI();
      this.showNotification("Contraseña establecida exitosamente", "success");
    } catch (err) {
      this.showNotification(err.message || "Error al guardar contraseña", "error");
    }
    btn.disabled = false;
    btn.textContent = "Guardar Contraseña";
  }

  async handleResetPassword(e) {
    e.preventDefault();
    const code = document.getElementById("reset-code").value.trim();
    const newPassword = document.getElementById("reset-new-password").value;
    if (!this._resetEmail) {
      this.showNotification("Debes solicitar un código primero", "error");
      return;
    }
    if (newPassword.length < 6) {
      this.showNotification("La contraseña debe tener al menos 6 caracteres", "error");
      return;
    }
    const btn = e.target.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "Cambiando...";
    try {
      await API.resetPassword(this._resetEmail, code, newPassword);
      this.closeAllOverlays();
      this.showNotification("Contraseña actualizada exitosamente", "success");
      this.showLoginForm();
    } catch (err) {
      this.showNotification(err.message || "Error al cambiar contraseña", "error");
    }
    btn.disabled = false;
    btn.textContent = "Cambiar Contraseña";
  }

  validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]@[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return "Formato de correo electrónico inválido";
    }
    if (email.length > 254) {
      return "El correo electrónico es demasiado largo";
    }
    if (email.startsWith('.') || email.startsWith('-') || email.endsWith('.') || email.endsWith('-')) {
      return "El correo no puede comenzar o terminar con punto o guión";
    }
    if (email.includes('..')) {
      return "El correo no puede tener puntos consecutivos";
    }
    const parts = email.split('@');
    if (parts.length !== 2 || parts[1].length < 4 || !/\.[a-zA-Z]{2,}$/.test(parts[1])) {
      return "Dominio de correo electrónico inválido";
    }
    return null;
  }

  validatePassword(password) {
    if (password.length < 6) {
      return "La contraseña debe tener al menos 6 caracteres";
    }
    if (password.length > 100) {
      return "La contraseña es demasiado larga";
    }
    return null;
  }

  async handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim().toLowerCase();
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-password-confirm").value;

    const passwordError = this.validatePassword(password);
    if (passwordError) {
      this.showNotification(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      this.showNotification("Las contraseñas no coinciden");
      return;
    }

    try {
      await API.register(username, email, password);
      this.showNotification("¡Cuenta creada! Ya puedes iniciar sesión");
      this.showLoginForm();
    } catch (error) {
      this.showNotification(error.message || "Error al registrar");
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;

    const emailError = this.validateEmail(email);
    if (emailError) {
      this.showNotification(emailError);
      return;
    }

    try {
      const loginResponse = await API.login(email, password);
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.checkAuthStatus();
      await this.loadCart();
      await this.loadFavorites();
      const name = this.user?.username || ''; this.showNotification(name ? `Bienvenido ${name}` : "Bienvenido");
      this.closeAllOverlays();
      this.resumePendingPurchase();
    } catch (error) {
      console.error('Login error:', error);
      this.showNotification(error.message || "Error al iniciar sesión");
    }
  }

  async handleLogout() {
    try {
      await API.logout();
      this.user = null;
      // IMPORTANTE: NO limpiar carrito/favoritos aquí porque están guardados en BD con user_id
      // Solo limpiar la referencia local, pero los datos siguen en la base de datos
      this.cart = [];
      this.favorites = [];
      // Recargar carrito de sesión anónima (si existe)
      await this.loadCart();
      await this.loadFavorites();
      this.showNotification("Hasta luego");
      this.closeAllOverlays();
      this.updateLoggedOutUI();
    } catch (error) {
      this.showNotification("Error al cerrar sesión");
    }
  }

  updateLoggedInUI() {
    if (this.user) {
      document.getElementById("profile-options").style.display = "none";
      document.getElementById("login-form").style.display = "none";
      document.getElementById("register-form").style.display = "none";
      document.getElementById("profile-logged-in").style.display = "block";
      document.getElementById("user-name").textContent = this.user.username;
      document.getElementById("user-email").textContent = this.user.email;
      document.getElementById("logout-option").style.display = "flex";
      const setPwdBtn = document.getElementById("set-password-btn");
      if (this.user.googleId && !this.user.hasPassword) {
        setPwdBtn.style.display = "flex";
      } else {
        setPwdBtn.style.display = "none";
      }
      const checkoutBtn = document.getElementById("profile-checkout-btn");
      if (checkoutBtn) {
        checkoutBtn.style.display = (this.cart && this.cart.length > 0) ? "" : "none";
      }
      const avatarImg = document.getElementById("profile-user-img");
      const avatarSvg = document.getElementById("profile-user-svg");
      if (avatarImg && avatarSvg) {
        if (this.user.avatarUrl) {
          avatarImg.src = this.user.avatarUrl;
          avatarImg.style.display = "";
          avatarSvg.style.display = "none";
        } else {
          avatarImg.style.display = "none";
          avatarSvg.style.display = "";
        }
      }
    }
  }

  updateLoggedOutUI() {
    document.getElementById("profile-options").style.display = "block";
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("password-reset-form").style.display = "none";
    document.getElementById("profile-logged-in").style.display = "none";
    document.getElementById("logout-option").style.display = "none";
  }

  goBack() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("password-reset-form").style.display = "none";
    document.getElementById("reset-step-1").style.display = "block";
    document.getElementById("reset-step-2").style.display = "none";
    document.getElementById("reset-step-3").style.display = "none";
    document.getElementById("theme-overlay").classList.remove("active");
    document.getElementById("profile-options").style.display = "";
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  handleEscape() {
    const expandedCard = document.querySelector(".card.expanded");
    if (expandedCard) {
      this.collapseCard();
      return;
    }

    const addToCartOverlay = document.getElementById("add-to-cart-overlay");
    if (addToCartOverlay && addToCartOverlay.classList.contains("active")) {
      this.closeAddToCartModal();
      return;
    }

    if (this.isSearching) {
      this.clearSearch();
      return;
    }

    this.closeAllOverlays();
  }

  closeAllOverlays() {
    document.querySelectorAll(".menu-overlay").forEach((overlay) => {
      overlay.classList.remove("active");
    });
    document.getElementById("payment-loading-overlay").classList.remove("active");
    this.closeSearch();
  }

  setTheme(theme) {
    if (theme === "system") {
      localStorage.removeItem("theme");
      document.body.removeAttribute("data-theme");
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        document.body.setAttribute("data-theme", "dark");
      } else {
        document.body.setAttribute("data-theme", "light");
      }
    } else {
      localStorage.setItem("theme", theme);
      document.body.setAttribute("data-theme", theme);
    }
  }

  loadTheme() {
    const savedTheme = localStorage.getItem("theme") || "system";
    this.setTheme(savedTheme);
  }

  updateThemeSelection() {
    const currentTheme = localStorage.getItem("theme") || "system";
    document.querySelectorAll(".theme-option").forEach((option) => {
      if (option.getAttribute("data-theme") === currentTheme) {
        option.classList.add("active");
        const checkIcon = option.querySelector(".check-icon");
        if (checkIcon) checkIcon.style.display = "block";
      } else {
        option.classList.remove("active");
        const checkIcon = option.querySelector(".check-icon");
        if (checkIcon) checkIcon.style.display = "none";
      }
    });
  }

  showNotification(message, type = "info") {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.classList.remove("success", "warning", "error", "info");
    notification.classList.add("show", type);

    setTimeout(() => {
      notification.classList.remove("show", type);
    }, 3000);
  }

  showConfirmDialog(title, message, onYes, onNo, yesLabel, noLabel) {
    document.getElementById("confirm-dialog-title").textContent = title;
    document.getElementById("confirm-dialog-msg").textContent = message;

    const overlay = document.getElementById("confirm-dialog-overlay");
    const yesBtn = document.getElementById("confirm-dialog-yes");
    const noBtn = document.getElementById("confirm-dialog-no");

    yesBtn.textContent = yesLabel || "Sí, llenar ahora";
    noBtn.textContent = noLabel || "No, continuar";

    const cleanup = () => {
      overlay.classList.remove("active");
      yesBtn.onclick = null;
      noBtn.onclick = null;
    };

    yesBtn.onclick = () => { cleanup(); if (onYes) onYes(); };
    noBtn.onclick = () => { cleanup(); if (onNo) onNo(); };
    overlay.classList.add("active");
  }

  openProfileEdit() {
    this.closeAllOverlays();

    if (!this.user) {
      this.showNotification("Inicia sesión para editar tu perfil", "error");
      document.getElementById("profile-overlay").classList.add("active");
      this.showLoginForm();
      return;
    }

    if (this.user) {
      document.getElementById("profile-phone").value = this.user.phone || "";
      document.getElementById("profile-address").value =
        this.user.address || "";
      document.getElementById("profile-city").value = this.user.city || "";
      document.getElementById("profile-postal").value =
        this.user.postalCode || "";
      document.getElementById("profile-country").value =
        this.user.country || "Colombia";
      document.getElementById("profile-doc-type").value =
        this.user.documentType || "";
      document.getElementById("profile-doc-number").value =
        this.user.documentNumber || "";
      this.updateProfileDocTypeUI();
    }

    this.setupProfileAutoSave();
    this.setupProfileDocTypeSelector();
    document.getElementById("profile-edit-overlay").classList.add("active");
  }

  updateProfileDocTypeUI() {
    const val = document.getElementById("profile-doc-type").value;
    const labels = {CC:"Cédula de Ciudadanía",CE:"Cédula de Extranjería",NIT:"NIT",TI:"Tarjeta de Identidad",PP:"Pasaporte"};
    document.getElementById("profile-doc-type-value").textContent = labels[val] || "Seleccionar";
  }

  setupProfileDocTypeSelector() {
    if (this._profileDocTypeSetup) return;
    this._profileDocTypeSetup = true;
    const container = document.getElementById("profile-doc-type-list");
    const types = [["CC","Cédula de Ciudadanía"],["CE","Cédula de Extranjería"],["NIT","NIT"],["TI","Tarjeta de Identidad"],["PP","Pasaporte"]];
    container.innerHTML = types.map(([v,l]) =>
      `<button type="button" class="filter-suboption" data-value="${v}">${l}</button>`
    ).join("");
    container.querySelectorAll(".filter-suboption").forEach(el => {
      el.addEventListener("click", () => {
        container.querySelectorAll(".filter-suboption").forEach(o => o.classList.remove("active"));
        el.classList.add("active");
        document.getElementById("profile-doc-type").value = el.dataset.value;
        document.getElementById("profile-doc-type-value").textContent = el.textContent;
        container.style.display = "none";
      });
    });
    document.getElementById("profile-doc-type-btn").onclick = () => {
      const list = document.getElementById("profile-doc-type-list");
      list.style.display = list.style.display === "none" ? "" : "none";
    };
  }

  setupProfileAutoSave() {
    if (this._profileAutoSaveSetup) return;
    this._profileAutoSaveSetup = true;
    const fields = ['profile-phone', 'profile-address', 'profile-city', 'profile-postal', 'profile-country'];
    const map = {
      'profile-phone': 'phone',
      'profile-address': 'address',
      'profile-city': 'city',
      'profile-postal': 'postalCode',
      'profile-country': 'country',
    };
    const doSave = () => {
      clearTimeout(this._profileTimer);
      this._profileTimer = setTimeout(() => {
        const data = {};
        fields.forEach((fid) => {
          const el2 = document.getElementById(fid);
          if (el2) data[map[fid]] = el2.value;
        });
        this.autoSaveProfile(data);
      }, 600);
    };
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', doSave);
      el.addEventListener('change', doSave);
    });
  }

  async handleProfileUpdate(e) {
    e.preventDefault();
    clearTimeout(this._profileTimer);

    const formData = new FormData(e.target);
    const profileData = {
      phone: formData.get("phone"),
      address: formData.get("address"),
      city: formData.get("city"),
      postalCode: formData.get("postalCode"),
      country: formData.get("country"),
      documentType: formData.get("documentType"),
      documentNumber: formData.get("documentNumber"),
    };

    try {
      await API.updateProfile(profileData);
      this.showNotification("Perfil actualizado exitosamente", "success");
      this.closeAllOverlays();
      await this.checkAuthStatus();
      if (this._returnToCheckout) {
        this._returnToCheckout = false;
        const stillMissing = this.getMissingPurchaseData();
        if (stillMissing.length > 0) {
          this.closeAllOverlays();
          this.showConfirmDialog(
            "Faltan datos de perfil",
            `Aún faltan: ${stillMissing.join(", ")}. ¿Quieres llenarlos ahora?`,
            () => {
              this._returnToCheckout = true;
              this.openProfileEdit();
            },
            () => {
              if (this._pendingOrder) {
                const o = this._pendingOrder;
                this.showOrderConfirm(o.shippingName, o.shippingAddress, o.shippingCity, o.shippingPhone, o.paymentMethod);
              }
            }
          );
        } else if (this._pendingOrder) {
          const o = this._pendingOrder;
          this.closeAllOverlays();
          this.showOrderConfirm(o.shippingName, o.shippingAddress, o.shippingCity, o.shippingPhone, o.paymentMethod);
        }
      }
    } catch (error) {
      this.showNotification("Error al actualizar el perfil", "error");
    }
  }

  buildFilterCategories() {
    const cats = [...new Set(this.products.map(p => p.category).filter(Boolean))];
    const container = document.getElementById("filter-category-submenu");
    container.innerHTML = '<button class="filter-suboption" data-value="">Todas</button>' +
      cats.map(c => `<button class="filter-suboption" data-value="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join("");
    container.querySelectorAll(".filter-suboption").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        document.getElementById("filter-category-value").textContent = val || "Todas";
        container.style.display = "none";
        this._filterCategory = val;
      });
    });
  }

  applyFilters() {
    const cat = this._filterCategory || "";
    const sort = this._filterSort || "";

    let filtered = [...(this._allProducts || this.products)];

    if (cat) filtered = filtered.filter(p => p.category === cat);

    if (sort === "price-asc") filtered.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") filtered.sort((a, b) => b.price - a.price);
    else if (sort === "name-asc") filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "name-desc") filtered.sort((a, b) => b.name.localeCompare(a.name));

    this.products = filtered;
    this.page = 1;
    this.renderProducts();
  }

  resetFilters() {
    this._filterCategory = "";
    this._filterSort = "";
    document.getElementById("filter-category-value").textContent = "Todas";
    document.getElementById("filter-sort-value").textContent = "Por defecto";
    this.products = [...(this._allProducts || this.products)];
    this.page = 1;
    this.renderProducts();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
