#!/bin/bash
# weaknet_test.sh — 契约站弱网回归测试（i18n.js 加载失败 → 零裸 key）
#
# 可靠性三保险（2026-09-29 假阳性事故后固化）：
#   1) 全新浏览器上下文：缓存命中的请求不触发 route 拦截——测前必须 close 重开
#   2) route --abort 拦截 i18n.js
#   3) 每页断言 i18nLoaded===false 自证拦截真的生效；断言失败=测试无效（非产品 PASS）
#
# 用法：bash tools/weaknet_test.sh [端口]
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-8790}"
URL="http://localhost:$PORT"

# 起本地静态服务（已占用则复用）
if ! curl -s -o /dev/null --max-time 2 "$URL/index.html"; then
  (setsid python3 -m http.server "$PORT" < /dev/null > /tmp/weaknet_srv.log 2>&1 &)
  sleep 1
fi
curl -s -o /dev/null --max-time 3 "$URL/index.html" || { echo "✗ 本地服务未就绪"; exit 1; }

agent-browser close > /dev/null 2>&1
sleep 2  # close 是异步退出：立即 route 会挂到垂死实例，随后的 open 是无拦截新实例（假阳性根源之二）
agent-browser network route "**/i18n.js" --abort > /dev/null 2>&1

FAIL=0; INVALID=0; PASS=0
for pg in index plan signatures charter signed; do
  for lg in zh en; do
    agent-browser open "$URL/$pg.html?lang=$lg&wt=$RANDOM" > /dev/null 2>&1
    agent-browser wait 700 > /dev/null 2>&1
    R=$(agent-browser eval "
var bare = [];
document.querySelectorAll('[data-i18n],[data-i18n-html]').forEach(function(el){
  var k = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-html');
  if ((el.textContent||'').trim() === k) bare.push(k);
});
var t = document.getElementById('title');
if (t && /^[a-z][A-Za-z]{5,}$/.test((t.textContent||'').trim())) bare.push(t.textContent.trim());
'blocked:' + (!window.covenantI18n) + '|bare:' + bare.length + '|sample:' + bare.slice(0,2).join(',')" 2>/dev/null | tr -d '"')
    BLOCKED=$(echo "$R" | cut -d'|' -f1 | cut -d: -f2)
    BARE=$(echo "$R" | cut -d'|' -f2 | cut -d: -f2)
    SAMPLE=$(echo "$R" | cut -d'|' -f3 | cut -d: -f2)
    if [ "$BLOCKED" != "true" ]; then
      echo "✗ $pg.html?$lg 拦截未生效(i18nLoaded=true)——测试无效，请检查缓存/上下文"; INVALID=$((INVALID+1))
    elif [ "$BARE" != "0" ]; then
      echo "✗ $pg.html?$lg 裸key=${BARE} $(echo "$R" | sed 's/.*sample://')"; FAIL=$((FAIL+1))
    else
      echo "✓ $pg.html?$lg"; PASS=$((PASS+1))
    fi
  done
done

agent-browser network unroute > /dev/null 2>&1
agent-browser close > /dev/null 2>&1
echo "----"
echo "PASS=$PASS FAIL=$FAIL INVALID=$INVALID"
[ "$FAIL" = "0" ] && [ "$INVALID" = "0" ] || exit 1
