document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname;

  const updateCartBadge = async () => {
    const badge = document.getElementById("cart-count-badge");
    if (!badge) return;
    try {
      const response = await fetch(`${API_URL}/cart`);
      const cart = await response.json();
      badge.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
    } catch (error) {
      badge.textContent = "0";
    }
  };

  if (!page.includes("admin")) {
    updateCartBadge();
  }

  // 1. MENU PAGE LOGIC (index.html)
  if (page.includes("index.html") || page === "/") {
    const menuContainer = document.getElementById("menu-container");
    const displayMenu = (menu) => {
      menuContainer.innerHTML = "";
      menu.categories.forEach((category) => {
        const categoryDiv = document.createElement("div");
        categoryDiv.className = "menu-category";
        categoryDiv.innerHTML = `<h3>${category.name}</h3>`;
        category.items.forEach((item) => {
          const itemDiv = document.createElement("div");
          itemDiv.className = "menu-item";
          if (!item.in_stock) itemDiv.classList.add("out-of-stock");
          itemDiv.innerHTML = `<div class="item-details"><strong>${
            item.name
          }</strong><p>${item.description}</p></div>
                        <div class="item-price">₹${item.price.toFixed(2)}</div>
                        <button class="btn add-to-cart-btn" data-id="${
                          item.id
                        }" data-name="${item.name}" data-price="${
            item.price
          }">Add</button>`;
          categoryDiv.appendChild(itemDiv);
        });
        menuContainer.appendChild(categoryDiv);
      });
    };
    const fetchMenu = async () => {
      try {
        const response = await fetch(`${API_URL}/menu`);
        const menu = await response.json();
        displayMenu(menu);
      } catch (error) {
        menuContainer.innerHTML = "<p>Failed to load menu.</p>";
      }
    };
    menuContainer.addEventListener("click", async (e) => {
      if (e.target.classList.contains("add-to-cart-btn")) {
        const item = {
          id: parseInt(e.target.dataset.id),
          name: e.target.dataset.name,
          price: parseFloat(e.target.dataset.price),
        };
        e.target.textContent = "Adding...";
        try {
          await fetch(`${API_URL}/cart/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
          updateCartBadge();
        } catch (error) {
          alert("Could not add item.");
        } finally {
          e.target.textContent = "Add";
        }
      }
    });
    fetchMenu();
  }

  // 2. CART PAGE LOGIC (cart.html)
  if (page.includes("cart.html")) {
    const cartItemsContainer = document.getElementById("cart-items-container");
    const cartTotalSpan = document.getElementById("cart-total");
    const placeOrderBtn = document.getElementById("place-order-btn");
    const updateCartItem = async (cartItemId, quantity, customization) => {
      try {
        const payload = {};
        if (quantity !== undefined) payload.quantity = quantity;
        if (customization !== undefined) payload.customization = customization;
        const response = await fetch(`${API_URL}/cart/item/${cartItemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Failed to update item.");
        fetchCart();
      } catch (error) {
        alert("Could not update cart item.");
      }
    };
    const removeCartItem = async (cartItemId) => {
      try {
        const response = await fetch(`${API_URL}/cart/item/${cartItemId}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Failed to remove item.");
        fetchCart();
      } catch (error) {
        alert("Could not remove cart item.");
      }
    };
    const displayCart = (cart) => {
      cartItemsContainer.innerHTML = "";
      if (!cart || cart.length === 0) {
        cartItemsContainer.innerHTML = "<p>Your cart is empty.</p>";
        placeOrderBtn.disabled = true;
      } else {
        placeOrderBtn.disabled = false;
        cart.forEach((item) => {
          const cartItemDiv = document.createElement("div");
          cartItemDiv.className = "cart-item-detailed";
          cartItemDiv.innerHTML = `<div class="item-info"><strong>${
            item.name
          }</strong><span class="item-price">₹${(
            item.price * item.quantity
          ).toFixed(2)}</span></div>
                        <div class="item-controls">
                            <div class="quantity-control">
                                <button class="qty-btn" data-cart-item-id="${
                                  item.cart_item_id
                                }" data-action="decrease">-</button>
                                <span class="quantity-text">${
                                  item.quantity
                                }</span>
                                <button class="qty-btn" data-cart-item-id="${
                                  item.cart_item_id
                                }" data-action="increase">+</button>
                            </div>
                            <button class="remove-btn" data-cart-item-id="${
                              item.cart_item_id
                            }">Remove</button>
                        </div>
                        <textarea class="customization-input" data-cart-item-id="${
                          item.cart_item_id
                        }" placeholder="Add customization notes...">${
            item.customization || ""
          }</textarea>`;
          cartItemsContainer.appendChild(cartItemDiv);
        });
      }
      const total = cart
        ? cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
        : 0;
      cartTotalSpan.textContent = total.toFixed(2);
      updateCartBadge();
    };
    const fetchCart = async () => {
      try {
        const response = await fetch(`${API_URL}/cart`);
        const cart = await response.json();
        displayCart(cart);
        return cart;
      } catch (error) {
        cartItemsContainer.innerHTML = "<p>Could not load your cart.</p>";
      }
    };
    cartItemsContainer.addEventListener("click", (e) => {
      const cartItemId = e.target.dataset.cartItemId;
      if (!cartItemId) return;
      if (e.target.classList.contains("qty-btn")) {
        const action = e.target.dataset.action;
        const quantitySpan =
          e.target.parentElement.querySelector(".quantity-text");
        let currentQuantity = parseInt(quantitySpan.textContent);
        if (action === "increase") {
          updateCartItem(cartItemId, currentQuantity + 1);
        } else if (action === "decrease" && currentQuantity > 1) {
          updateCartItem(cartItemId, currentQuantity - 1);
        } else if (action === "decrease" && currentQuantity <= 1) {
          if (confirm("Remove this item?")) removeCartItem(cartItemId);
        }
      }
      if (e.target.classList.contains("remove-btn")) {
        if (confirm("Remove this item?")) removeCartItem(cartItemId);
      }
    });
    cartItemsContainer.addEventListener(
      "blur",
      (e) => {
        if (e.target.classList.contains("customization-input")) {
          updateCartItem(
            e.target.dataset.cartItemId,
            undefined,
            e.target.value
          );
        }
      },
      true
    );
    placeOrderBtn.addEventListener("click", async () => {
      placeOrderBtn.textContent = "Placing...";
      placeOrderBtn.disabled = true;
      try {
        const response = await fetch(`${API_URL}/place-order`, {
          method: "POST",
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        const orderDetails = await response.json();
        sessionStorage.setItem("lastOrderId", orderDetails.order_id);
        window.location.href = "invoice.html";
      } catch (error) {
        alert(`Could not place order: ${error.message}`);
        placeOrderBtn.textContent = "Place Order";
        placeOrderBtn.disabled = false;
      }
    });
    fetchCart();
  }

  // 3. MY ORDERS PAGE LOGIC (my_orders.html)
  if (page.includes("my_orders.html")) {
    const container = document.querySelector(".container");
    const pendingContainer = document.getElementById(
      "pending-orders-container"
    );
    const acceptedContainer = document.getElementById(
      "accepted-orders-container"
    );
    const completedContainer = document.getElementById(
      "completed-orders-container"
    );
    const tabNav = document.querySelector(".tab-nav");
    const notification = document.getElementById("paid-order-notification");
    let displayedOrderIds = null;

    if (notification) {
      notification.querySelector(".close-btn").addEventListener("click", () => {
        notification.style.display = "none";
      });
    }

    // ### FIX: Corrected tab switching logic ###
    if (tabNav) {
      tabNav.addEventListener("click", (e) => {
        if (e.target.tagName !== "BUTTON") return;

        // Update button styles
        tabNav
          .querySelectorAll(".tab-btn")
          .forEach((btn) => btn.classList.remove("active"));
        e.target.classList.add("active");

        // Show the correct content container
        document
          .querySelectorAll(".order-container")
          .forEach((cont) => cont.classList.remove("active"));
        const status = e.target.dataset.status;
        const containerToShow = document.getElementById(
          `${status.toLowerCase()}-orders-container`
        );
        if (containerToShow) {
          containerToShow.classList.add("active");
        }
      });
    }

    const renderOrderCard = (order, config) => {
      const cutoffMinutes = config.cancellation_cutoff_minutes;
      const itemsHtml = order.items
        .map((item) => {
          const note = item.customization
            ? `<span class="customization-note">Note: ${item.customization}</span>`
            : "";
          return `<li>${item.name} (x${item.quantity})${note}</li>`;
        })
        .join("");

      let paymentStatusHtml = "";
      if (order.status === "Completed") {
        paymentStatusHtml = `<span class="payment-status unpaid">Payment Pending</span>`;
      }

      const orderTime = new Date(order.timestamp);
      const minutesSinceOrder = (new Date() - orderTime) / 60000;
      let actionButtons = "";
      if (order.status === "Pending" && minutesSinceOrder < cutoffMinutes) {
        actionButtons = `
                    <div class="order-actions" style="margin-top: 15px; display:flex; gap: 10px;">
                        <button class="btn modify-order-btn" data-order-id="${order.order_id}">Modify</button>
                        <button class="btn btn-secondary delete-order-btn" data-order-id="${order.order_id}">Delete</button>
                    </div>`;
      }
      return `
                <div class="order-card status-${order.status}">
                    <div class="order-card-header">
                        <h3>Order ID: ${order.order_id}</h3>
                        ${paymentStatusHtml}
                    </div>
                    <p><strong>Status:</strong> ${order.status}</p>
                    <ul>${itemsHtml}</ul>
                    ${actionButtons}
                </div>`;
    };

    const fetchActiveOrders = async () => {
      try {
        const [ordersResponse, configResponse] = await Promise.all([
          fetch(`${API_URL}/history`),
          fetch(`${API_URL}/config`),
        ]);
        const allOrders = await ordersResponse.json();
        const config = await configResponse.json();

        const activeOrders = allOrders.filter(
          (o) =>
            o.status === "Pending" ||
            o.status === "Accepted" ||
            o.status === "Completed"
        );
        const newOrderIds = new Set(activeOrders.map((o) => o.order_id));

        if (displayedOrderIds !== null && notification) {
          const disappearedIds = [...displayedOrderIds].filter(
            (id) => !newOrderIds.has(id)
          );
          if (disappearedIds.length > 0) {
            const paidOrder = allOrders.find(
              (o) => disappearedIds.includes(o.order_id) && o.status === "Paid"
            );
            if (paidOrder) {
              notification.style.display = "flex";
            }
          }
        }
        displayedOrderIds = newOrderIds;

        const pending = activeOrders.filter((o) => o.status === "Pending");
        const accepted = activeOrders.filter((o) => o.status === "Accepted");
        const completed = activeOrders.filter((o) => o.status === "Completed");

        pendingContainer.innerHTML = pending.length
          ? pending.map((o) => renderOrderCard(o, config)).join("")
          : "<p>No pending orders.</p>";
        acceptedContainer.innerHTML = accepted.length
          ? accepted.map((o) => renderOrderCard(o, config)).join("")
          : "<p>No accepted orders.</p>";
        completedContainer.innerHTML = completed.length
          ? completed.map((o) => renderOrderCard(o, config)).join("")
          : "<p>No completed orders.</p>";
      } catch (error) {
        console.error("Could not fetch active orders:", error);
      }
    };

    container.addEventListener("click", async (e) => {
      const orderId = e.target.dataset.orderId;
      if (!orderId) return;
      if (e.target.classList.contains("delete-order-btn")) {
        if (confirm("Are you sure?")) {
          try {
            const response = await fetch(`${API_URL}/order/${orderId}`, {
              method: "DELETE",
            });
            if (!response.ok) throw new Error((await response.json()).detail);
            alert("Order deleted.");
            fetchActiveOrders();
          } catch (error) {
            alert(`Error: ${error.message}`);
          }
        }
      }
      if (e.target.classList.contains("modify-order-btn")) {
        if (confirm("Move items to cart and delete this order?")) {
          try {
            const response = await fetch(`${API_URL}/recart/${orderId}`, {
              method: "POST",
            });
            if (!response.ok) throw new Error((await response.json()).detail);
            alert("Items moved to cart.");
            window.location.href = "cart.html";
          } catch (error) {
            alert(`Error: ${error.message}`);
          }
        }
      }
    });
    fetchActiveOrders();
    setInterval(fetchActiveOrders, 7000);
  }

  // 4. PAID HISTORY PAGE LOGIC (history.html)
  if (page.includes("history.html") && !page.includes("my_orders")) {
    const historyContainer = document.getElementById("paid-history-container");
    const fetchPaidHistory = async () => {
      try {
        const response = await fetch(`${API_URL}/history`);
        const allOrders = await response.json();
        const paidOrders = allOrders.filter((o) => o.status === "Paid");
        if (paidOrders.length === 0) {
          historyContainer.innerHTML =
            "<p>You have no paid orders in your history.</p>";
          return;
        }
        historyContainer.innerHTML = paidOrders
          .map((order) => {
            const itemsHtml = order.items
              .map((item) => {
                const note = item.customization
                  ? `<span class="customization-note">Note: ${item.customization}</span>`
                  : "";
                return `<li>${item.name} (x${item.quantity})${note}</li>`;
              })
              .join("");
            return `<div class="order-card status-Paid"><h3>Order ID: ${
              order.order_id
            }</h3><p><strong>Date:</strong> ${new Date(
              order.timestamp
            ).toLocaleString()}</p><ul>${itemsHtml}</ul><div class="invoice-total" style="margin-top:10px;"><strong>Total: ₹${order.total_cost.toFixed(
              2
            )}</strong></div></div>`;
          })
          .join("");
      } catch (error) {
        historyContainer.innerHTML = "<p>Could not load order history.</p>";
      }
    };
    fetchPaidHistory();
  }

  // 5. INVOICE PAGE LOGIC (invoice.html)
  if (page.includes("invoice.html")) {
    const invoiceContainer = document.querySelector(".invoice");
    const orderId = sessionStorage.getItem("lastOrderId");
    const displayInvoice = (order) => {
      const itemsHtml = order.items
        .map(
          (item) =>
            `<div class="invoice-item"><span>${item.name} (x${
              item.quantity
            })</span><span>₹${(item.price * item.quantity).toFixed(
              2
            )}</span></div>`
        )
        .join("");
      invoiceContainer.innerHTML = `<h3>Invoice Details</h3><p><strong>Order ID:</strong> ${
        order.order_id
      }</p><p><strong>Date:</strong> ${new Date(
        order.timestamp
      ).toLocaleString()}</p><hr>${itemsHtml}<hr><div class="invoice-total"><strong>Total: ₹${order.total_cost.toFixed(
        2
      )}</strong></div>`;
    };
    if (!orderId) {
      invoiceContainer.innerHTML = "<p>No order details found.</p>";
    } else {
      const fetchOrderDetails = async () => {
        try {
          const response = await fetch(`${API_URL}/order/${orderId}`);
          if (!response.ok) throw new Error("Order not found.");
          const order = await response.json();
          displayInvoice(order);
        } catch (error) {
          invoiceContainer.innerHTML = "<p>Could not fetch order details.</p>";
        }
      };
      fetchOrderDetails();
    }
  }
});
