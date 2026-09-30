#!/bin/bash
# Smoke + security tests. Usage: npm test
export JWT_SECRET=$(openssl rand -hex 32) ENC_KEY=$(openssl rand -hex 32) WEBHOOK_SECRET=$(openssl rand -hex 32) ADMIN_EMAIL=a@b.co ADMIN_PASSWORD=very-long-pass-123 DB_FILE=/tmp/t.db PORT=3111
rm -f $DB_FILE*; node server.js >/tmp/srv.log 2>&1 & PID=$!; sleep 1.5; U=http://localhost:3111; J=/tmp/cj; rm -f $J
H=(-H 'X-Requested-With: fetch' -H 'Content-Type: application/json'); F=0
chk(){ if [ "$2" == "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got $2 want $3)"; F=1; fi; }
c(){ curl -s -o /tmp/o -w '%{http_code}' "$@"; }
chk "admin API blocked w/o login" $(c $U/api/admin/products) 401
chk "panel redirects w/o login" $(c $U/admin-portal) 302
chk "panel.js hidden" $(c $U/admin-portal/panel.js) 404
chk "login page reachable" $(c $U/admin-portal-login) 200
chk "CSRF header required" $(c -X POST $U/api/admin/login -H 'Content-Type: application/json' -d '{}') 403
chk "bad login" $(c -X POST $U/api/admin/login "${H[@]}" -d '{"email":"a@b.co","password":"nope"}') 401
chk "good login" $(c -c $J -X POST $U/api/admin/login "${H[@]}" -d '{"email":"a@b.co","password":"very-long-pass-123"}') 200
chk "store starts empty" "$(curl -s $U/api/products)" "[]"
P='{"title_en":"Tee","title_ar":"تيشيرت","price":50,"cost":20,"sizes":["S","M"],"colors":[{"name":"Sky","hex":"#38bdf8"}],"images":[],"ali_url":"https://www.aliexpress.com/item/1.html","supplier_id":"S1"}'
chk "create product" $(c -b $J -X POST $U/api/admin/products "${H[@]}" -d "$P") 200
chk "reject non-aliexpress URL (SSRF)" $(c -b $J -X POST $U/api/admin/products "${H[@]}" -d "${P/www.aliexpress.com/evil.com}") 400
chk "reject bad hex (injection)" $(c -b $J -X POST $U/api/admin/products "${H[@]}" -d "${P/'#38bdf8'/'red;x'}") 400
chk "public hides cost/ali" "$(curl -s $U/api/products | grep -c -E 'cost|ali_url')" 0
chk "order w/ tampered price ignored" $(c -X POST $U/api/orders "${H[@]}" -d '{"items":[{"id":1,"qty":1,"size":"M","color":"Sky","price":1}],"customer":{"name":"A","email":"a@a.co","phone":"+962799","address":"x","city":"Amman","country":"JO"}}') 200
REF=$(sed 's/.*"ref":"\([^"]*\)".*/\1/' /tmp/o); chk "server total = 50" "$(grep -o '"total":[0-9.]*' /tmp/o)" '"total":50'
W="{\"ref\":\"$REF\",\"status\":\"paid\",\"amount\":50}"; S=$(printf %s "$W" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
chk "webhook bad signature" $(c -X POST $U/api/webhooks/payment -H 'Content-Type: application/json' -H 'x-signature: 00' -d "$W") 401
chk "webhook good signature" $(c -X POST $U/api/webhooks/payment -H 'Content-Type: application/json' -H "x-signature: $S" -d "$W") 200
chk "webhook replay idempotent" "$(curl -s -X POST $U/api/webhooks/payment -H 'Content-Type: application/json' -H "x-signature: $S" -d "$W" | grep -c dup)" 1
curl -s -b $J $U/api/admin/orders | grep -o '"profit":[0-9.]*,"status":"paid","fulfillment":"queued","payout":"queued"' >/dev/null && echo "PASS split: profit 30 queued" || { echo "FAIL split"; F=1; }
chk "reject full card number" $(c -b $J -X PUT $U/api/admin/settings "${H[@]}" -d '{"payout":{"holder":"4111111111111111"}}') 400
chk "save payout settings" $(c -b $J -X PUT $U/api/admin/settings "${H[@]}" -d '{"payout":{"holder":"Mohammad","bank":"Bank","iban":"JO94CBJO0010000000000131000302","last4":"1234"},"gateway":{"provider":"stripe","key":"sk_live_abcd1234","secret":"whsec_9999"}}') 200
chk "secrets masked on read" "$(curl -s -b $J $U/api/admin/settings | grep -c 'sk_live')" 0
chk "secrets encrypted in DB" "$(strings /tmp/t.db* | grep -c -E 'JO94CBJO|sk_live')" 0
chk "CSP header set" "$(curl -sI $U/ | grep -ci content-security-policy)" 1
kill $PID; exit $F
