document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname;

  window.updateStatus = async (orderId, newStatus) => {
    try {
      await fetch(`${API_URL}/orders/${orderId}/status?status=${newStatus}`, {
        method: "POST",
      });
      if (typeof fetchOrders === "function") {
        fetchOrders();
      }
    } catch (error) {
      alert("Failed to update status.");
    }
  };

  if (page.includes("admin_orders.html")) {
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

    tabNav.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      tabNav
        .querySelectorAll(".tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
      e.target.classList.add("active");
      document
        .querySelectorAll(".order-container")
        .forEach((cont) => cont.classList.remove("active"));
      const status = e.target.dataset.status;
      document
        .getElementById(`${status.toLowerCase()}-orders-container`)
        .classList.add("active");
    });

    const renderAdminOrderCard = (order) => {
      const itemsHtml = order.items
        .map((item) => {
          const note = item.customization
            ? `<span class="customization-note">Note: ${item.customization}</span>`
            : "";
          return `<li>${item.name} (x${item.quantity})${note}</li>`;
        })
        .join("");
      const paymentStatusHtml = `<span class="payment-status unpaid">Not Paid</span>`;
      return `<div class="order-card status-${
        order.status
      }"><div class="order-card-header"><h3>Order ID: ${
        order.order_id
      }</h3>${paymentStatusHtml}</div><p><strong>Status:</strong> ${
        order.status
      }</p><p><strong>Time:</strong> ${new Date(
        order.timestamp
      ).toLocaleTimeString()}</p><ul>${itemsHtml}</ul><div>
                        ${
                          order.status === "Pending"
                            ? `<button class="btn" onclick="updateStatus('${order.order_id}', 'Accepted')">Accept</button>`
                            : ""
                        }
                        ${
                          order.status === "Accepted"
                            ? `<button class="btn" onclick="updateStatus('${order.order_id}', 'Completed')">Complete</button>`
                            : ""
                        }
                        ${
                          order.status === "Completed"
                            ? `<button class="btn btn-paid" onclick="updateStatus('${order.order_id}', 'Paid')">Mark as Paid</button>`
                            : ""
                        }
                        ${
                          order.status !== "Completed" &&
                          order.status !== "Rejected" &&
                          order.status !== "Paid"
                            ? `<button class="btn btn-secondary" onclick="updateStatus('${order.order_id}', 'Rejected')">Reject</button>`
                            : ""
                        }
                    </div></div>`;
    };

    const fetchOrders = async () => {
      try {
        const response = await fetch(`${API_URL}/orders`);
        const allOrders = await response.json();
        const pending = allOrders
          .filter((o) => o.status === "Pending")
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const accepted = allOrders
          .filter((o) => o.status === "Accepted")
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const completed = allOrders
          .filter((o) => o.status === "Completed")
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        pendingContainer.innerHTML = pending.length
          ? pending.map(renderAdminOrderCard).join("")
          : "<p>No pending orders.</p>";
        acceptedContainer.innerHTML = accepted.length
          ? accepted.map(renderAdminOrderCard).join("")
          : "<p>No accepted orders.</p>";
        completedContainer.innerHTML = completed.length
          ? completed.map(renderAdminOrderCard).join("")
          : "<p>No completed orders.</p>";
      } catch (error) {
        console.error("Fetch orders error:", error);
      }
    };
    window.fetchOrders = fetchOrders;
    fetchOrders();
    setInterval(fetchOrders, 5000);
  }

  if (page.includes("admin_menu.html")) {
    const menuManagementContainer = document.getElementById(
      "menu-management-container"
    );
    const saveMenuBtn = document.getElementById("save-menu-btn");
    const addCategoryBtn = document.getElementById("add-category-btn");
    let currentMenuData = {};
    const displayMenuForEditing = () => {
      menuManagementContainer.innerHTML = "";
      if (!currentMenuData.categories) return;
      currentMenuData.categories.forEach((category, catIndex) => {
        const categoryDiv = document.createElement("div");
        categoryDiv.className = "menu-category";
        categoryDiv.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;"><h3>${category.name}</h3><button class="btn btn-secondary add-item-btn" data-cat-index="${catIndex}">Add Item</button></div>`;
        category.items.forEach((item, itemIndex) => {
          const itemFormHTML = `<div class="menu-item"><div class="item-details" style="flex-grow:1;"><p>Name: <input type="text" class="admin-input" value="${
            item.name
          }" data-cat="${catIndex}" data-item="${itemIndex}" data-field="name"></p><p>Price: <input type="number" class="admin-input" value="${
            item.price
          }" data-cat="${catIndex}" data-item="${itemIndex}" data-field="price" step="0.01"></p><p>In Stock: <input type="checkbox" ${
            item.in_stock ? "checked" : ""
          } data-cat="${catIndex}" data-item="${itemIndex}" data-field="in_stock"></p></div></div>`;
          categoryDiv.innerHTML += itemFormHTML;
        });
        menuManagementContainer.appendChild(categoryDiv);
      });
    };
    const fetchMenuForEditing = async () => {
      try {
        const response = await fetch(`${API_URL}/menu`);
        if (!response.ok) throw new Error("Failed to fetch menu.");
        currentMenuData = await response.json();
        displayMenuForEditing();
      } catch (error) {
        menuManagementContainer.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
      }
    };
    addCategoryBtn.addEventListener("click", () => {
      const categoryName = prompt("Enter new category name:");
      if (categoryName && categoryName.trim()) {
        currentMenuData.categories.push({
          name: categoryName.trim(),
          items: [],
        });
        displayMenuForEditing();
      }
    });
    menuManagementContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("add-item-btn")) {
        const catIndex = parseInt(e.target.dataset.catIndex);
        const itemName = prompt("Enter item name:");
        if (!itemName || !itemName.trim()) return;
        const itemPrice = parseFloat(prompt("Enter price:", "0.00"));
        if (isNaN(itemPrice)) return;
        const newItem = {
          id: Date.now(),
          name: itemName.trim(),
          description: "New item.",
          price: itemPrice,
          in_stock: true,
        };
        currentMenuData.categories[catIndex].items.push(newItem);
        displayMenuForEditing();
      }
    });
    saveMenuBtn.addEventListener("click", async () => {
      menuManagementContainer.querySelectorAll("input").forEach((input) => {
        const { cat, item, field } = input.dataset;
        if (cat === undefined || item === undefined || field === undefined)
          return;
        const value =
          input.type === "checkbox"
            ? input.checked
            : input.type === "number"
            ? parseFloat(input.value)
            : input.value;
        currentMenuData.categories[cat].items[item][field] = value;
      });
      try {
        saveMenuBtn.textContent = "Saving...";
        await fetch(`${API_URL}/update-menu`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentMenuData),
        });
        alert("Menu saved!");
      } catch (error) {
        alert(`Error saving menu: ${error.message}`);
      } finally {
        saveMenuBtn.textContent = "Save All Menu Changes";
      }
    });
    fetchMenuForEditing();
  }

  if (page.includes("admin_settings.html")) {
    const cutoffTimeInput = document.getElementById("cutoff-time-input");
    const paidVisibilityInput = document.getElementById(
      "paid-visibility-input"
    );
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_URL}/config`);
        const config = await response.json();
        cutoffTimeInput.value = config.cancellation_cutoff_minutes;
        paidVisibilityInput.value = config.paid_visibility_minutes;
      } catch (error) {
        alert("Could not load settings.");
      }
    };
    saveSettingsBtn.addEventListener("click", async () => {
      const newCutoffTime = parseInt(cutoffTimeInput.value);
      const newVisibilityTime = parseInt(paidVisibilityInput.value);
      if (
        isNaN(newCutoffTime) ||
        newCutoffTime < 0 ||
        isNaN(newVisibilityTime) ||
        newVisibilityTime < 0
      ) {
        alert("Please enter valid numbers.");
        return;
      }
      try {
        await fetch(`${API_URL}/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cancellation_cutoff_minutes: newCutoffTime,
            paid_visibility_minutes: newVisibilityTime,
          }),
        });
        alert("Settings saved!");
      } catch (error) {
        alert("Failed to save settings.");
      }
    });
    fetchConfig();
  }
});
