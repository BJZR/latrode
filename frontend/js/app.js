function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseSizesStock(jsonStr) {
  try { return JSON.parse(jsonStr) || []; } catch (_) { return []; }
}

function getSizeStock(sizes, sizeName) {
  const sz = (sizes || []).find(s => s.size === sizeName);
  return sz ? sz.stock : 0;
}

class App {
  imgUrl(url) {
    if (!url || url.startsWith('http') || url.startsWith('/')) return url;
    return 'assets/img/' + url;
  }

  getStockForSelection() {
    if (!this.selectedColor || !this.selectedSize) return 0;
    return getSizeStock(this.selectedColor.sizes, this.selectedSize);
  }

  constructor() {
    this.products = [];
    this.cart = [];
    this.favorites = [];
    this.currentProduct = null;
    this.selectedColor = null;
    this.selectedSize = null;
    this.selectedQuantity = 1;
    this.user = null;
    this.isSearching = false;
    this.lastScrollPosition = 0;
    this.lastExpandedIndex = null;
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

    this.products = this.products.filter(p => p.stock > 0);
    this.products.forEach((product, index) => {
      const slide = document.createElement("section");
      slide.className = "slide";
      slide.dataset.index = index;

      slide.innerHTML = `
                <article class="card" data-product-id="${product.id}" data-index="${index}">
                    <div class="card-image">
                        <img src="${this.imgUrl(product.imageUrl)}" alt="${escapeHTML(product.name)}" class="main-product-image">
                    </div>
                    <div class="card-info-wrapper">
                        <div class="card-content">
                            <p class="product-name">${escapeHTML(product.name)}</p>
                            <div class="tag">#${escapeHTML(product.category)}</div>
                            <div class="price">$${Math.round(product.price).toLocaleString()}</div>
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
                                        <button class="color-option ${i === 0 ? "active" : ""}"
                                                data-color-id="${color.id}"
                                                data-color-name="${escapeHTML(color.name)}"
                                                data-color-stock="${color.stock || 0}"
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
                                <div class="color-name-label">${product.colors && product.colors.length > 0 ? escapeHTML(product.colors[0].name) : ''}</div>
                                <div class="color-stock-label">${(() => { if (!product.colors || !product.colors[0]) return ''; const sizes = product.colors[0].sizes || []; const firstSize = product.sizes && product.sizes[0]; if (firstSize && sizes.length > 0) { const stock = getSizeStock(sizes, firstSize); return stock > 0 ? stock + ' unidades disponibles' : 'Agotado'; } return product.colors[0].stock > 0 ? product.colors[0].stock + ' unidades disponibles' : 'Agotado'; })()}</div>
                            </div>
                            <div class="size-selector">
                                <span class="size-label">Talla:</span>
                                <div class="size-options">
                                    ${
                                      product.sizes &&
                                      product.sizes.length > 0
                                        ? (() => {
                                            const firstSizes = product.colors && product.colors[0] && product.colors[0].sizes || [];
                                            return product.sizes.map((size, i) => {
                                              const stock = getSizeStock(firstSizes, size);
                                              return `<button class="size-option ${i === 0 ? "active" : ""} ${stock === 0 ? "disabled" : ""}"
                                                  data-size="${size}"
                                                  data-size-stock="${stock}">${size}</button>`;
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
      .querySelector(".modal-qty-btn.minus")
      .addEventListener("click", () => this.updateModalQuantity(-1));
    document
      .querySelector(".modal-qty-btn.plus")
      .addEventListener("click", () => this.updateModalQuantity(1));

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
        const activeSize = card.querySelector(".size-option.active");
        const sizes = parseSizesStock(option.getAttribute("data-sizes-stock"));
        card.querySelectorAll(".size-option").forEach((btn) => {
          const stock = getSizeStock(sizes, btn.getAttribute("data-size"));
          btn.setAttribute("data-size-stock", stock);
          btn.classList.toggle("disabled", stock === 0);
        });
        const stockEl = card.querySelector(".color-stock-label");
        if (stockEl) {
          if (activeSize) {
            const stock = getSizeStock(sizes, activeSize.getAttribute("data-size"));
            stockEl.textContent = stock > 0 ? stock + " unidades disponibles" : "Agotado";
          } else {
            const firstSize = card.querySelector(".size-option:not(.disabled)");
            if (firstSize) {
              const stock = getSizeStock(sizes, firstSize.getAttribute("data-size"));
              stockEl.textContent = stock > 0 ? stock + " unidades disponibles" : "Agotado";
            }
          }
        }
      });
    });

    card.querySelectorAll(".size-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        card
          .querySelectorAll(".size-option")
          .forEach((o) => o.classList.remove("active"));
        option.classList.add("active");
        const activeColor = card.querySelector(".color-option.active");
        const stockEl = card.querySelector(".color-stock-label");
        if (stockEl && activeColor) {
          const sizes = parseSizesStock(activeColor.getAttribute("data-sizes-stock"));
          const stock = getSizeStock(sizes, option.getAttribute("data-size"));
          stockEl.textContent = stock > 0 ? stock + " unidades disponibles" : "Agotado";
        }
      });
    });

  }

  handleMainAction(e) {
    e.stopPropagation();
    if (document.body.classList.contains("expanded-mode")) {
      this.collapseCard();
    } else {
      this.loadCart();
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
        document.getElementById("profile-options").style.display = "none";
        document.getElementById("login-form").style.display = "none";
        document.getElementById("register-form").style.display = "none";
        document.getElementById("profile-logged-in").style.display = "block";
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

	this.currentProduct = this.products.find(
      (p) => String(p.id) === card.dataset.productId,
    );
    this.bindCardEvents(card);
    this.updateFavoriteIcon();
  }

  collapseCard() {
    document
      .querySelectorAll(".card.expanded")
      .forEach((c) => c.classList.add("collapsing"));
    document
      .querySelectorAll(".card")
      .forEach((c) => c.classList.remove("expanded"));
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
                    <img src="${this.imgUrl(item.product.imageUrl)}" alt="${escapeHTML(item.product.name)}">
                </div>
                <div class="cart-item-details">
                    <h3 class="cart-item-name">${escapeHTML(item.product.name)}</h3>
                    <div class="cart-item-info">
                        <span class="cart-item-color">
                            ${item.color ? `<span class="color-dot" style="background: ${escapeHTML(item.color.hex)}"></span>${escapeHTML(item.color.name)}` : ""}
                            ${item.size ? `<span class="cart-item-size">Talla: ${item.size}</span>` : ""}
                        </span>
                        <span class="cart-item-price">$${Math.round(item.product.price).toLocaleString()}</span>
                    </div>
                    <div class="cart-item-controls">
                        <button class="quantity-btn qty-btn-minus" aria-label="Disminuir">
                            <svg viewBox="0 0 24 24" width="22" height="22"><use href="assets/icons/minus.svg#icon"/></svg>
                        </button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="quantity-btn qty-btn-plus" aria-label="Aumentar">
                            <svg viewBox="0 0 24 24" width="22" height="22"><use href="assets/icons/plus.svg#icon"/></svg>
                        </button>
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

    container.querySelectorAll(".qty-btn-minus").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const itemEl = e.target.closest(".cart-item");
        this.updateCartQuantity(itemEl, -1);
      });
    });

    container.querySelectorAll(".qty-btn-plus").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const itemEl = e.target.closest(".cart-item");
        this.updateCartQuantity(itemEl, 1);
      });
    });

    container.querySelectorAll(".remove-item-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.removeFromCart(btn.dataset.id));
    });

    this.updateCartSummary();
  }

  updateCartSummary() {
    let subtotal = 0;
    this.cart.forEach((item) => {
      subtotal += item.product.price * item.quantity;
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

  async updateCartQuantity(itemEl, delta) {
    const itemId = itemEl.dataset.id;
    const item = this.cart.find((i) => String(i.id) === itemId);
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
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

    if (this.favorites.length === 0) {
      container.innerHTML = `
                <div class="favorites-empty">
                    <svg viewBox="0 0 24 24"><use href="assets/icons/favorite.svg#icon"/></svg>
                    <h3>No tienes favoritos</h3>
                    <p>Agrega productos a favoritos para verlos aquí</p>
                </div>
            `;
      return;
    }

    container.innerHTML = this.favorites
      .map(
        (fav) => `
            <div class="favorite-item" data-id="${fav.id}" data-product-id="${fav.product.id}">
                <div class="favorite-item-image">
                    <img src="${this.imgUrl(fav.product.imageUrl)}" alt="${fav.product.name}">
                </div>
                <div class="favorite-item-details">
                    <h3 class="favorite-item-name">${escapeHTML(fav.product.name)}</h3>
                    <div class="favorite-item-tag">#${escapeHTML(fav.product.category)}</div>
                    <div class="favorite-item-price">$${Math.round(fav.product.price).toLocaleString()}</div>
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
          <span class="order-status ${order.paymentStatus || order.status}">${this.getOrderStatusText(order.paymentStatus || order.status)}</span>
        </div>
        <div class="order-products-preview">
          ${order.items && order.items.length > 0 ? order.items.slice(0, 3).map(item => `
            <span class="order-product-preview">${escapeHTML(item.productName)}${item.colorName ? ` <span class="order-product-meta">(${escapeHTML(item.colorName)})</span>` : ''}${item.size ? ` <span class="order-product-meta">[${escapeHTML(item.size)}]</span>` : ''}${item.quantity > 1 ? ` x${item.quantity}` : ''}</span>
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
        <span class="order-status ${order.paymentStatus || order.status}">${this.getOrderStatusText(order.paymentStatus || order.status)}</span>
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
            <span class="order-product-name">${escapeHTML(item.productName)}${item.colorName ? ` <span class="order-product-meta">(${escapeHTML(item.colorName)})</span>` : ''}${item.size ? ` <span class="order-product-meta">[${escapeHTML(item.size)}]</span>` : ''}</span>
            <span class="order-product-qty">x${item.quantity}</span>
            <span class="order-product-price">$${Math.round((item.productPrice || item.price) * item.quantity).toLocaleString()}</span>
          </div>
        `).join('') : '<p>Cargando productos...</p>'}
      </div>
      ${(order.status === 'pending' || order.paymentStatus === 'pending') && (Date.now() - new Date(order.createdAt).getTime()) < 7200000 ? `
        <div class="order-detail-actions">
          <button class="cancel-order-btn" onclick="app.confirmCancelOrder(${order.id})">Cancelar pedido</button>
        </div>
      ` : ''}
    `;
  }

  confirmCancelOrder(orderId) {
    this.showConfirmDialog(
      "Cancelar pedido",
      "¿Estás seguro de que deseas cancelar este pedido? Esta acción no se puede deshacer.",
      async () => {
        try {
          await API.cancelOrder(orderId);
          this.showNotification("Pedido cancelado correctamente");
          this.loadUserOrders();
        } catch (error) {
          this.showNotification(error.message || "Error al cancelar el pedido", "error");
        }
      }
    );
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
      this.imgUrl(product.colors[0].imageUrl || product.imageUrl);
    modal.querySelector(".modal-product-image").alt = product.name;
    modal.querySelector(".modal-product-name").textContent = product.name;
    modal.querySelector(".modal-product-price").textContent =
      `$${Math.round(product.price).toLocaleString()}`;

    modal.querySelector(".modal-color-options").innerHTML = product.colors
      .map(
        (color, i) => `
            <button class="color-option ${i === 0 ? "active" : ""}"
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
            <button class="size-option ${i === 0 ? "active" : ""}"
                    data-size="${escapeHTML(size)}">${escapeHTML(size)}</button>
        `,
      )
      .join("");

    this.selectedColor = product.colors[0];
    this.selectedSize = (product.sizes && product.sizes[0]) || null;
    this.selectedQuantity = 1;
    modal.querySelector(".modal-quantity").textContent = "1";

    modal.querySelectorAll(".modal-color-options .color-option").forEach((btn) => {
      btn.addEventListener("click", () => {
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
        modal
          .querySelectorAll(".modal-size-options .size-option")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedSize = btn.dataset.size;
      });
    });

    modal.classList.add("active");
  }

  closeAddToCartModal() {
    document.getElementById("add-to-cart-overlay").classList.remove("active");
  }

  updateModalQuantity(delta) {
    const maxStock = this.getStockForSelection();
    let qty = this.selectedQuantity + delta;
    if (qty > maxStock) {
      this.showNotification("Solo hay " + maxStock + " unidades disponibles", "error");
      qty = maxStock;
    }
    this.selectedQuantity = Math.max(1, qty);
    document.querySelector(".modal-quantity").textContent =
      this.selectedQuantity;
  }

  async confirmAddToCart() {
    if (!this.currentProduct || !this.selectedColor) return;

    const maxStock = this.getStockForSelection();
    if (this.selectedQuantity > maxStock) {
      this.showNotification("Solo hay " + maxStock + " unidades disponibles", "error");
      return;
    }

    try {
      await API.addToCart(
        this.currentProduct.id,
        this.selectedColor.id,
        this.selectedQuantity,
        this.selectedSize || '',
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
      this.showNotification(error.message || "Error agregando al carrito", "error");
    }
  }

  addCurrentToCart() {
    if (!this.currentProduct) return;

    const card = document.querySelector(".card.expanded");
    const activeColorBtn = card
      ? card.querySelector(".color-option.active")
      : null;
    const activeSizeBtn = card
      ? card.querySelector(".size-option.active")
      : null;

    let selectedColor = null;
    if (activeColorBtn) {
      const colorId = activeColorBtn.dataset.colorId;
      selectedColor = this.currentProduct.colors.find((c) => String(c.id) === colorId);
    }

    if (!selectedColor && this.currentProduct.colors.length > 0) {
      selectedColor = this.currentProduct.colors[0];
    }

    if (!selectedColor) return;

    const selectedSize = activeSizeBtn
      ? activeSizeBtn.dataset.size
      : (this.currentProduct.sizes && this.currentProduct.sizes[0]) || null;

    const stock = getSizeStock(selectedColor.sizes, selectedSize);
    if (stock <= 0) {
      this.showNotification("Producto agotado para esta combinación", "error");
      return;
    }

    API.addToCart(this.currentProduct.id, selectedColor.id, 1, selectedSize || '')
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
      container.innerHTML = methods.map((m, i) => `
        <label class="payment-option ${i === 0 ? "active" : ""}" data-method="${m.name}">
          <input type="radio" name="payment_method" value="${m.name}" ${i === 0 ? "checked" : ""} hidden>
          <span class="payment-option-content">
            <svg viewBox="0 0 24 24" width="24" height="24"><use href="assets/icons/help.svg#icon"/></svg>
            <div>
              <span class="payment-name">${this.getPaymentMethodName(m.name)}</span>
              <p class="payment-desc">${escapeHTML(m.description || "")}</p>
            </div>
          </span>
        </label>
      `).join("");

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
      (sum, item) => sum + item.product.price * item.quantity,
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
      (sum, item) => sum + item.product.price * item.quantity,
      0,
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
      (sum, item) => sum + item.product.price * item.quantity,
      0,
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
        }
      } else {
        this.showNotification("Pedido confirmado. Gracias por tu compra", "success");
        this.closeAllOverlays();
        await this.clearCart();
        await this.loadProducts();
        this.renderProducts();
      }
    } catch (error) {
      this.hidePaymentLoading();
      this.showNotification(error.message || "Error al procesar el pago", "error");
      await API.cancelOrder(order.id).catch(() => {});
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
      if (result.wompiStatus === "APPROVED") {
        document.getElementById("payment-pending-overlay").classList.remove("active");
        this.showNotification("Pago confirmado. Gracias por tu compra", "success");
        await this.clearCart();
        await this.loadProducts();
        this.renderProducts();
      } else if (result.wompiStatus === "DECLINED") {
        document.getElementById("payment-pending-overlay").classList.remove("active");
        this.showNotification("El pago fue rechazado. Puedes intentar de nuevo", "error");
        await API.cancelOrder(orderId).catch(() => {});
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
    document.getElementById("profile-logged-in").style.display = "none";
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
    }
  }

  updateLoggedOutUI() {
    document.getElementById("profile-options").style.display = "block";
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("profile-logged-in").style.display = "none";
    document.getElementById("logout-option").style.display = "none";
  }

  goBack() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("password-reset-form").style.display = "none";
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
    this.collapseCard();
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

  showConfirmDialog(title, message, onYes, onNo) {
    document.getElementById("confirm-dialog-title").textContent = title;
    document.getElementById("confirm-dialog-msg").textContent = message;

    const overlay = document.getElementById("confirm-dialog-overlay");
    const yesBtn = document.getElementById("confirm-dialog-yes");
    const noBtn = document.getElementById("confirm-dialog-no");

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
    const instock = document.getElementById("filter-instock").checked;

    let filtered = [...(this._allProducts || this.products)];

    if (cat) filtered = filtered.filter(p => p.category === cat);
    if (instock) filtered = filtered.filter(p => p.stock > 0);

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
    document.getElementById("filter-instock").checked = false;
    this.products = [...(this._allProducts || this.products)];
    this.page = 1;
    this.renderProducts();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
