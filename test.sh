#!/bin/bash
echo "=== BASICS Store Diagnostic Test ==="
echo "Testing Server Health..."

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/products
if [ $? -eq 0 ]; then
  echo -e "\n[PASS] Server is active and API is accessible."
else
  echo -e "\n[FAIL] Server is offline or unreachable."
fi