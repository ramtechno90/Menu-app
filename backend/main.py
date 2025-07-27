import json
import uuid
import datetime
import os
import shutil
from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from pymongo import MongoClient
from bson import ObjectId

# --- Database Connection ---
# Make sure to set MONGO_URI in your Render environment variables
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(MONGO_URI)
db = client.bistro_db

# Define collections (like tables in SQL)
orders_collection = db.orders
menu_collection = db.menu
config_collection = db.config

# In-memory storage for non-persistent cart data
carts_db: Dict[str, List[Dict]] = {}

app = FastAPI()

# --- FastAPI Startup Event to Seed Database ---
@app.on_event("startup")
def startup_db_client():
    # Check if the menu collection is empty. If so, seed it from the local menu.json file.
    if menu_collection.count_documents({}) == 0:
        print("--- Seeding menu collection from menu.json ---")
        try:
            with open("menu.json", "r") as f:
                menu_data = json.load(f)
                menu_collection.insert_one(menu_data)
        except Exception as e:
            print(f"--- Could not seed menu: {e} ---")

    # Ensure there is a default config if the collection is empty
    if config_collection.count_documents({}) == 0:
        print("--- Seeding default config ---")
        config_collection.insert_one({
            "cancellation_cutoff_minutes": 5,
            "paid_visibility_minutes": 10
        })

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # IMPORTANT: Change this to your Netlify URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

# --- Helper to convert MongoDB's ObjectId to string ---
def mongo_to_dict(item):
    if item and "_id" in item:
        item["_id"] = str(item["_id"])
    return item

# --- Endpoints ---

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

@app.get("/menu")
def get_menu():
    menu = menu_collection.find_one()
    if menu:
        return mongo_to_dict(menu)
    raise HTTPException(status_code=404, detail="Menu not found")

@app.post("/update-menu")
def update_menu(updated_menu: Dict[str, Any]):
    updated_menu.pop("_id", None)
    menu_collection.replace_one({}, updated_menu, upsert=True)
    return {"message": "Menu updated successfully"}

@app.get("/config")
def get_config():
    config = config_collection.find_one()
    if config:
        return mongo_to_dict(config)
    raise HTTPException(status_code=404, detail="Configuration not found")

@app.post("/config")
def update_config(new_config: ConfigModel):
    config_collection.replace_one({}, new_config.dict(), upsert=True)
    return {"message": "Configuration updated successfully"}

@app.post("/place-order")
def place_order(request: Request):
    client_ip = request.client.host
    cart = carts_db.get(client_ip)
    if not cart:
        raise HTTPException(status_code=400, detail="Cart is empty")
        
    order_id_str = f"BISTRO-{uuid.uuid4().hex[:6].upper()}"
    timestamp = datetime.datetime.now(datetime.timezone.utc)
    
    new_order = {
        "order_id": order_id_str,
        "client_ip": client_ip,
        "timestamp": timestamp,
        "status_update_timestamp": timestamp,
        "items": cart,
        "status": "Pending",
        "total_cost": sum(i['price'] * i['quantity'] for i in cart)
    }
    
    orders_collection.insert_one(new_order)
    
    if client_ip in carts_db:
        del carts_db[client_ip]
        
    return mongo_to_dict(new_order)

@app.get("/orders")
def get_orders():
    orders = [mongo_to_dict(order) for order in orders_collection.find()]
    return orders

@app.post("/orders/{order_id}/status")
def update_order_status(order_id: str, status: str):
    if status not in ["Accepted", "Completed", "Rejected", "Paid"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    result = orders_collection.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": status,
            "status_update_timestamp": datetime.datetime.now(datetime.timezone.utc)
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
        
    return {"message": f"Order {order_id} status updated to {status}"}

@app.get("/history")
def get_order_history(request: Request):
    client_ip = request.client.host
    orders = [mongo_to_dict(o) for o in orders_collection.find({"client_ip": client_ip})]
    orders.sort(key=lambda x: x['timestamp'], reverse=True)
    return orders

@app.get("/order/{order_id}")
def get_single_order(order_id: str):
    order = orders_collection.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return mongo_to_dict(order)

@app.delete("/order/{order_id}")
def delete_order(order_id: str, request: Request):
    order = orders_collection.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.get("client_ip") != request.client.host:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    config = config_collection.find_one() or {}
    order_time = order["timestamp"]
    cutoff_minutes = config.get("cancellation_cutoff_minutes", 5)
    
    if datetime.datetime.now(datetime.timezone.utc) > order_time + datetime.timedelta(minutes=cutoff_minutes):
        raise HTTPException(status_code=403, detail="Cut-off time for deletion has passed.")
        
    orders_collection.delete_one({"order_id": order_id})
    return {"message": "Order successfully deleted."}

@app.post("/recart/{order_id}")
def recart_order(order_id: str, request: Request):
    client_ip = request.client.host
    order = orders_collection.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.get("client_ip") != client_ip:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    config = config_collection.find_one() or {}
    order_time = order["timestamp"]
    cutoff_minutes = config.get("cancellation_cutoff_minutes", 5)
    
    if datetime.datetime.now(datetime.timezone.utc) > order_time + datetime.timedelta(minutes=cutoff_minutes):
        raise HTTPException(status_code=403, detail="Cut-off time for modification has passed.")
        
    carts_db[client_ip] = order["items"]
    orders_collection.delete_one({"order_id": order_id})
    return {"message": "Order moved to cart for modification."}

# --- Cart endpoints remain in-memory ---

@app.get("/cart")
def get_cart(request: Request):
    return carts_db.get(request.client.host, [])

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