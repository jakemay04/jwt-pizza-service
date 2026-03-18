#!/bin/bash

BASE="http://localhost:3000"

# Login to get token
echo "Logging in..."
ADMIN_TOKEN=$(curl -s -X PUT $BASE/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@jwt.com","password":"admin"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $ADMIN_TOKEN"

while true; do
  echo "--- Sending traffic ---"

  # HTTP - GET requests
  curl -s -X GET "$BASE/api/order/menu" > /dev/null
  curl -s -X GET "$BASE/api/franchise" > /dev/null
  curl -s -X GET "$BASE/api/order" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null

  # Auth - success
  curl -s -X PUT "$BASE/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"a@jwt.com","password":"admin"}' > /dev/null

  # Auth - failure
  curl -s -X PUT "$BASE/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"a@jwt.com","password":"wrongpassword"}' > /dev/null

  # Pizza - successful order
  curl -s -X POST "$BASE/api/order" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.05}]}' > /dev/null

  # Pizza - failed order (21 pizzas triggers factory failure)
  curl -s -X POST "$BASE/api/order" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"franchiseId":1,"storeId":1,"items":[
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05},
      {"menuId":1,"description":"Veggie","price":0.05}
    ]}' > /dev/null

  echo "✅ Round complete"
  sleep 5
done