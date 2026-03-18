#!/bin/bash

BASE="http://localhost:3000"

while true; do
  echo "--- Sending traffic ---"

  # GET requests
  curl -s -X GET "$BASE/api/order/menu" > /dev/null
  curl -s -X GET "$BASE/api/franchise" > /dev/null

  # Successful login
  curl -s -X PUT "$BASE/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"a@jwt.com","password":"admin"}' > /dev/null

  # Failed login
  curl -s -X PUT "$BASE/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"a@jwt.com","password":"wrongpassword"}' > /dev/null

  echo "✅ Round complete"
  sleep 5
done