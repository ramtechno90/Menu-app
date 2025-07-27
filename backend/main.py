import json
import uuid
import datetime
import shutil
import os
from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# --- File Paths ---
ORDERS_FILE = "orders.json"
CONFIG_FILE = "config.json"
MENU_FILE = "menu.json"

app = FastAPI()

# --- Data Dictionaries ---
carts_db: Dict[str, List[Dict]] = {}
orders_db: Dict[str, Dict] = {}
config: Dict[str, Any] = {}

# --- Helper Functions (Load/Save) ---
def load_config() -> Dict[str, Any]:
    """Loads config from the JSON file."""
    try:
        with open(CONFIG_FILE, "r") as f:
            conf_data = json.load(f)
            # Ensure all keys are present with default values
            conf_data.setdefault("cancellation_cutoff_minutes", 5)
            conf_data.setdefault("paid_visibility_minutes", 10)
            return conf_data
    except (FileNotFoundError, json.JSONDecodeError):
        # Default config if file is missing or invalid
        return {"cancellation_cutoff_minutes": 5, "paid_visibility_minutes": 10}

def save_config():
    """Saves the current config to the JSON file safely."""
    temp_file = f"{CONFIG_FILE}.tmp"
    with open(temp_file, "w") as f:
        json.dump(config, f, indent=4)
    os.replace(temp_file, CONFIG_FILE)

def load_orders() -> Dict[str, Dict]:
    """Loads orders from the JSON file."""
    try:
        with open(ORDERS_FILE, "r") as f: return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_orders():
    """Saves the current state of orders to the JSON file safely."""
    temp_file = f"{ORDERS_FILE}.tmp"
    with open(temp_file, "w") as f:
        json.dump(orders_db, f, indent=4)
    os.replace(temp_file, ORDERS_FILE)

# --- Load data on startup ---
orders_db = load_orders()
config = load_config()

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# --- Pydantic Models ---
class ConfigModel(BaseModel):
    cancellation_cutoff_minutes: int
    paid_visibility_minutes: int

class MenuItemModel(BaseModel):
    id: int
    name: str
    price: float

class CartItemUpdateModel(BaseModel):
    quantity: Optional[int] = Field(None, ge=1)
    customization: Optional[str] = Field(None, max_length=100)
    
# --- Image Upload Endpoint ---
@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    save_dir = "frontend/images"
    os.makedirs(save_dir, exist_ok=True)
    
    unique_id = uuid.uuid4().hex
    try:
        extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    except Exception:
        extension = "jpg"
    unique_filename = f"{unique_id}.{extension}"
    save_path = f"{save_dir}/{unique_filename}"
    
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save the file on the server: {e}")
    finally:
        file.file.close()
        
    return {"image_url": f"images/{unique_filename}"}

# --- Cart Logic ---
@app.post("/cart/add")
def add_to_cart(item: MenuItemModel, request: Request):
    client_ip = request.client.host
    if client_ip not in carts_db:
        carts_db[client_ip] = []
    cart = carts_db[client_ip]
    existing_item = next((ci for ci in cart if ci["id"] == item.id and ci["customization"] == ""), None)
    if existing_item:
        existing_item["quantity"] += 1
    else:
        new_cart_item = item.dict()
        new_cart_item["cart_item_id"] = uuid.uuid4().hex
        new_cart_item["quantity"] = 1
        new_cart_item["customization"] = ""
        cart.append(new_cart_item)
    return cart

@app.put("/cart/item/{cart_item_id}")
def update_cart_item(cart_item_id: str, update_data: CartItemUpdateModel, request: Request):
    client_ip = request.client.host
    cart = carts_db.get(client_ip, [])
    item_to_update = next((item for item in cart if item["cart_item_id"] == cart_item_id), None)
    if not item_to_update:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if update_data.quantity is not None:
        item_to_update["quantity"] = update_data.quantity
    if update_data.customization is not None:
        item_to_update["customization"] = update_data.customization
    return item_to_update

@app.delete("/cart/item/{cart_item_id}")
def remove_cart_item(cart_item_id: str, request: Request):
    client_ip = request.client.host
    cart = carts_db.get(client_ip, [])
    item_index = next((i for i, item in enumerate(cart) if item["cart_item_id"] == cart_item_id), -1)
    if item_index == -1:
        raise HTTPException(status_code=404, detail="Cart item not found")
    del cart[item_index]
    return {"message": "Item removed from cart"}

# --- Main Endpoints ---
@app.get("/menu")
def get_menu():
    with open(MENU_FILE, "r") as f: return json.load(f)

@app.get("/cart")
def get_cart(request: Request):
    return carts_db.get(request.client.host, [])

@app.post("/place-order")
def place_order(request: Request):
    client_ip = request.client.host
    cart = carts_db.get(client_ip)
    if not cart:
        raise HTTPException(status_code=400, detail="Cart is empty")
    order_id = f"BISTRO-{uuid.uuid4().hex[:6].upper()}"
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    new_order = {
        "order_id": order_id, "client_ip": client_ip, "timestamp": timestamp,
        "status_update_timestamp": timestamp, "items": cart, "status": "Pending",
        "total_cost": sum(i['price'] * i['quantity'] for i in cart)
    }
    orders_db[order_id] = new_order
    save_orders()
    if client_ip in carts_db:
        del carts_db[client_ip]
    return new_order

@app.delete("/order/{order_id}")
def delete_order(order_id: str, request: Request):
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    order = orders_db[order_id]
    if order.get("client_ip") != request.client.host:
        raise HTTPException(status_code=403, detail="Permission denied")
    order_time = datetime.datetime.fromisoformat(order["timestamp"])
    cutoff_minutes = config.get("cancellation_cutoff_minutes", 5)
    if datetime.datetime.now(datetime.timezone.utc) > order_time + datetime.timedelta(minutes=cutoff_minutes):
        raise HTTPException(status_code=403, detail="Cut-off time for deletion has passed.")
    del orders_db[order_id]
    save_orders()
    return {"message": "Order successfully deleted."}

@app.post("/recart/{order_id}")
def recart_order(order_id: str, request: Request):
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    order = orders_db[order_id]
    client_ip = request.client.host
    if order.get("client_ip") != client_ip:
        raise HTTPException(status_code=403, detail="Permission denied")
    order_time = datetime.datetime.fromisoformat(order["timestamp"])
    cutoff_minutes = config.get("cancellation_cutoff_minutes", 5)
    if datetime.datetime.now(datetime.timezone.utc) > order_time + datetime.timedelta(minutes=cutoff_minutes):
        raise HTTPException(status_code=403, detail="Cut-off time for modification has passed.")
    carts_db[client_ip] = order["items"]
    del orders_db[order_id]
    save_orders()
    return {"message": "Order moved to cart for modification."}

@app.get("/config")
def get_config():
    return config

@app.post("/config")
def update_config(new_config: ConfigModel):
    config["cancellation_cutoff_minutes"] = new_config.cancellation_cutoff_minutes
    config["paid_visibility_minutes"] = new_config.paid_visibility_minutes
    save_config()
    return config

@app.get("/history")
def get_order_history(request: Request):
    client_ip = request.client.host
    history = [o for o in orders_db.values() if o.get("client_ip") == client_ip]
    history.sort(key=lambda x: x['timestamp'], reverse=True)
    return history

@app.get("/order/{order_id}")
def get_single_order(order_id: str):
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    return orders_db[order_id]
    
# --- Admin Panel Endpoints ---
@app.get("/orders")
def get_orders():
    return list(orders_db.values())

@app.post("/orders/{order_id}/status")
def update_order_status(order_id: str, status: str):
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    if status not in ["Accepted", "Completed", "Rejected", "Paid"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    orders_db[order_id]["status"] = status
    orders_db[order_id]["status_update_timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save_orders()
    return orders_db[order_id]

@app.post("/update-menu")
def update_menu(updated_menu: Dict[str, Any]):
    with open("menu.json", "w") as f: json.dump(updated_menu, f, indent=4)
    return {"message": "Menu updated successfully"}