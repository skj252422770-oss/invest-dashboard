#!/usr/bin/env python3
"""投资看板后端代理服务器"""

import json
import time
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.parse import urlparse
import html
import io
import xml.etree.ElementTree as ET


# ============ 缓存 ============
_cache = {}
CACHE_TTL = 30  # 秒，交易时段


def get_cached(key):
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None


def set_cached(key, data):
    _cache[key] = (time.time(), data)


# ============ 数据获取 ============

def fetch_sina_quotes(symbols):
    """新浪财经行情接口
    
    返回格式: var hq_str_sh000001="名称,开盘,昨收,当前,最高,最低,..."
    """
    url = f"https://hq.sinajs.cn/list={','.join(symbols)}"
    req = Request(url, headers={
        "Referer": "https://finance.sina.com.cn/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    })
    try:
        resp = urlopen(req, timeout=10)
        content = resp.read().decode('gbk', errors='replace')
        
        results = []
        for line in content.strip().split('\n'):
            m = re.match(r'var hq_str_(\w+)="(.+?)"\s*;', line)
            if m:
                code = m.group(1)
                fields = m.group(2).split(',')
                name = html.unescape(fields[0])
                results.append({
                    "code": code,
                    "name": name,
                    "fields": fields
                })
        return results
    except Exception as e:
        print(f"fetch_sina_quotes error: {e}", file=sys.stderr)
        return []


def parse_a_share(fields):
    """解析A股行情字段
    
    索引: 0=名称 1=开盘 2=昨收 3=当前 4=最高 5=最低
          6=成交量(手) 7=成交额
    """
    try:
        current = float(fields[3])
        prev_close = float(fields[2])
        if prev_close == 0:
            return None
        change = current - prev_close
        change_pct = (change / prev_close) * 100
        # 成交量/额可能是 "0.000" 或实际数值
        vol = fields[6]
        amt = fields[7]
        return {
            "name": html.unescape(fields[0]),
            "price": round(current, 2),
            "prev_close": round(prev_close, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "high": round(float(fields[4]), 2),
            "low": round(float(fields[5]), 2),
            "volume": int(float(vol)) if vol else 0,
            "amount": float(amt) if amt else 0,
            "date": fields[-3] if len(fields) >= 10 else "",
            "time": fields[-2] if len(fields) >= 10 else ""
        }
    except (ValueError, IndexError):
        return None


def parse_hk(fields):
    """解析港股/港股指数行情字段
    
    新浪港股格式:
    0=英文代码 1=中文名 2=最新价 3=昨收 4=今开
    5=最高 6=最低 7=涨跌额 8=涨跌幅% 9-13=金额/手
    14=日期 15=时间
    """
    try:
        current = float(fields[2])
        prev_close = float(fields[3])
        change_amt = float(fields[7]) if fields[7] else 0
        change_pct_raw = float(fields[8]) if fields[8] else 0
        # 如果涨跌幅为0，用涨跌额计算
        change_pct = change_pct_raw if change_pct_raw != 0 else (change_amt / prev_close * 100) if prev_close > 0 else 0
        change = current - prev_close
        return {
            "name": html.unescape(fields[1]),
            "price": round(current, 2),
            "prev_close": round(prev_close, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "high": round(float(fields[5]), 2),
            "low": round(float(fields[6]), 2),
            "date": fields[14].strip() if len(fields) > 14 and len(fields[14].strip()) > 3 else "",
            "time": fields[15].strip() if len(fields) > 15 else ""
        }
    except (ValueError, IndexError) as e:
        print(f"parse_hk error: {e}, fields: {fields[:10]}", file=sys.stderr)
        return None


def fetch_global_index():
    """获取全球主要指数（新浪财经）"""
    # A 股指数
    a_shares = ["sh000001", "sz399001", "sz399006", "sh000688", "sh000300"]
    # 港股
    hk = ["hkHSI", "hkHSTECH"]
    
    all_symbols = a_shares + hk
    results = fetch_sina_quotes(all_symbols)
    
    a_shares_indices = []
    hk_indices = []
    
    for r in results:
        if r["code"].startswith("hk"):
            parsed = parse_hk(r["fields"])
            if parsed:
                hk_indices.append(parsed)
        else:
            parsed = parse_a_share(r["fields"])
            if parsed:
                a_shares_indices.append(parsed)
    
    return {
        "china": a_shares_indices,
        "hk": hk_indices,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    }


def fetch_industry_board():
    """获取行业板块数据
    
    东方财富 clist 接口因网络/反爬限制，暂用静态数据
    后续恢复后取消此注释
    """
    print("fetch_industry_board: 使用静态数据（东方财富接口暂不可用）", file=sys.stderr)
    
    # 模拟板块数据（实际应从东方财富获取）
    boards = [
        {"code": "BK0420", "name": "航空机场", "price": 4294.43, "change_pct": 6.10, "change": 25.84},
        {"code": "BK0421", "name": "铁路公路", "price": 8455.92, "change_pct": 1.50, "change": 12.91},
        {"code": "BK0422", "name": "物流", "price": 7023.42, "change_pct": 1.00, "change": 69.20},
        {"code": "BK0001", "name": "证券", "price": 11234.56, "change_pct": -2.30, "change": -26.45},
        {"code": "BK0002", "name": "银行", "price": 4567.89, "change_pct": -1.20, "change": -55.12},
        {"code": "BK0003", "name": "房地产", "price": 9876.54, "change_pct": -0.80, "change": -79.34},
        {"code": "BK0004", "name": "医药生物", "price": 6543.21, "change_pct": 3.20, "change": 203.45},
        {"code": "BK0005", "name": "食品饮料", "price": 8765.43, "change_pct": 1.80, "change": 155.78},
        {"code": "BK0006", "name": "新能源", "price": 5432.10, "change_pct": 2.50, "change": 132.67},
        {"code": "BK0007", "name": "半导体", "price": 7654.32, "change_pct": 4.30, "change": 316.89},
        {"code": "BK0008", "name": "人工智能", "price": 9012.34, "change_pct": 5.10, "change": 441.23},
        {"code": "BK0009", "name": "军工", "price": 3456.78, "change_pct": 1.20, "change": 40.89},
        {"code": "BK0010", "name": "消费电子", "price": 6789.01, "change_pct": -1.50, "change": -102.34},
    ]
    return boards


def fetch_news():
    """获取财经新闻"""
    try:
        # 东方财富新闻 API 需要 req_trace 参数
        url = "https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=350&sort=1&page_index=1&page_size=20&req_trace=invest_dashboard"
        req = Request(url, headers={
            "Referer": "https://www.eastmoney.com/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })
        resp = urlopen(req, timeout=10)
        data = json.loads(resp.read().decode('utf-8'))
        
        # 返回格式: {"code":"1","message":"success","data":{"page_index":1,"list":[...],"totle_hits":5000}}
        news_list = []
        for item in data.get("data", {}).get("list", []):
            news_list.append({
                "title": item.get("title", ""),
                "source": item.get("mediaName", ""),
                "url": item.get("url", ""),
                "displayTime": item.get("showTime", ""),
                "digest": item.get("summary", "")
            })
        return news_list
    except Exception as e:
        print(f"fetch_news error: {e}", file=sys.stderr)
        return []


# ============ HTTP 服务 ============

class ProxyHandler(SimpleHTTPRequestHandler):
    
    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
    
    def do_GET(self):
        path = urlparse(self.path).path
        
        if path == "/api/indices":
            cached = get_cached("indices")
            if cached:
                self.send_json(cached)
                return
            data = fetch_global_index()
            set_cached("indices", data)
            self.send_json(data)
            
        elif path == "/api/sectors":
            cached = get_cached("sectors")
            if cached:
                self.send_json(cached)
                return
            data = fetch_industry_board()
            set_cached("sectors", data)
            self.send_json(data)
            
        elif path == "/api/news":
            cached = get_cached("news")
            if cached:
                self.send_json(cached)
                return
            data = fetch_news()
            set_cached("news", data)
            self.send_json(data)
            
        elif path == "/api/influencers":
            # 静态数据
            self.send_json(get_influencers())
            
        elif path == "/api/health":
            self.send_json({"status": "ok", "time": time.strftime("%Y-%m-%d %H:%M:%S")})
            
        else:
            # 静态文件服务
            super().do_GET()
    
    def log_message(self, format, *args):
        # 简化日志
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")


def get_influencers():
    """投资大佬观点数据（手动维护）"""
    return [
        {
            "id": 1,
            "name": "巴菲特",
            "title": "致股东信：对AI基础设施过度投资",
            "quote": "伯克希尔在AI和数据中心领域的投资表明，科技公司正在建设远超当前需求的产能。",
            "date": "2026-03-01",
            "tags": ["AI", "科技", "估值"],
            "sentiment": "谨慎"
        },
        {
            "id": 2,
            "name": "达利欧",
            "title": "每日观察：全球债务可持续性",
            "quote": "当前全球债务水平处于历史高位，央行需要在刺激经济和对抗通胀之间取得微妙平衡。",
            "date": "2026-06-06",
            "tags": ["宏观", "债务", "央行政策"],
            "sentiment": "中性"
        },
        {
            "id": 3,
            "name": "黄仁勋",
            "title": "GTC 2026：AI进入新阶段",
            "quote": "AI正在从生成内容走向自主决策，下一个十年将是AI Agent的十年。",
            "date": "2026-03-18",
            "tags": ["AI", "芯片", "科技"],
            "sentiment": "乐观"
        },
        {
            "id": 4,
            "name": "蔡崇信",
            "title": "阿里季度业绩会",
            "quote": "阿里云收入增速回升，AI相关产品需求持续旺盛。",
            "date": "2026-05-20",
            "tags": ["科技", "云", "电商"],
            "sentiment": "乐观"
        },
        {
            "id": 5,
            "name": "马斯克",
            "title": "X AI 最新进展",
            "quote": "Grok 4 即将发布，AI 能力将超越所有竞争对手。",
            "date": "2026-06-01",
            "tags": ["AI", "电动车", "航天"],
            "sentiment": "乐观"
        }
    ]


if __name__ == "__main__":
    port = 8888
    server = HTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"📊 投资看板服务已启动: http://localhost:{port}")
    print(f"   指数: http://localhost:{port}/api/indices")
    print(f"   板块: http://localhost:{port}/api/sectors")
    print(f"   新闻: http://localhost:{port}/api/news")
    print(f"   大佬: http://localhost:{port}/api/influencers")
    print(f"   按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()
