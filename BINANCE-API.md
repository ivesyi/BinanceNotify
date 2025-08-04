# 币安 WebSocket API 文档

## WebSocket API 基本信息

该API需要用户的API密钥。有关创建API密钥的说明，请参考[这里](https://www.binance.com/cn/my/settings/api-management)。

- **基础URL**: `wss://api.binance.com/sapi/wss`
- 每个连接到基础URL的有效期最多为24小时。请适当处理重新连接。
- WebSocket客户端应每30秒主动发送PING消息。
- 如果WebSocket服务器在一分钟内没有收到PING消息，连接将被关闭。
- 建议为这些PING消息使用空载荷。
- 签名载荷必须通过获取除签名之外的所有请求参数并按名称字母顺序排序来生成。
- 除非另有说明，所有时间戳都以UTC毫秒为单位。
- 除非另有说明，所有字段名称和值都区分大小写。

## WebSocket 连接限制

WebSocket服务器每秒最多接受5条消息。消息包括：
- PING帧
- PONG帧  
- JSON格式的消息（例如，订阅或取消订阅请求）

如果用户超过此限制，连接将被终止。重复断开连接可能导致服务器IP封禁。

## WebSocket API 请求格式

### 连接URL

```
wss://api.binance.com/sapi/wss?random={{random}}&topic={{topic}}&recvWindow={{recvWindow}}&timestamp={{timestamp}}&signature={{signature}}
```

将 `{{xxx}}` 替换为相应的值。

### 格式示例

```
wss://api.binance.com/sapi/wss?random=56724ac693184379ae23ffe5e910063c&topic=topic1&recvWindow=30000&timestamp=1753244327210&signature=341098eff29e3ef395ed4ea85035bd7fe9e9356d2b0d4f1f97655c74516a2d65
```

### 参数详情

- **random**: 随机字符串或数字（推荐长度≤32）以确保签名随机性和有效性
  - 示例: `random=56724ac693184379ae23ffe5e910063`

- **topic**: 支持订阅一个或多个主题，用竖线 `|` 分隔
  - 示例: `topic=topic1|topic2`

- **recvWindow**: 允许的延迟窗口（毫秒）。最大值：60000毫秒
  - 示例: `recvWindow=30000`

- **timestamp**: 当前时间戳（毫秒）
  - 示例: `timestamp=1753244327210`

- **signature**: 当前请求的签名

## WebSocket API 认证

用户的API密钥必须包含在WebSocket请求头中作为 `X-MBX-APIKEY` 字段来认证连接。

## 时间安全

SIGNED端点还需要发送一个参数 `timestamp`，应该是创建和发送请求时的毫秒时间戳。

可以发送一个额外的参数 `recvWindow`，以指定时间戳后请求有效的毫秒数。

## 签名生成

以下是如何使用echo、openssl和curl从Linux命令行发送有效签名载荷的分步示例。

### 示例密钥

| Key | Value |
|-----|-------|
| apiKey | vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A |
| secretKey | NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j |

### 签名载荷

连接URL中所有参数的连接（不包括签名）：
```
random={{random}}&topic={{topic}}&recvWindow={{recvWindow}}&timestamp={{timestamp}}
```

### HMAC SHA256 签名示例

```bash
$ echo -n "random=56724ac693184379ae23ffe5e910063c&topic=topic1&recvWindow=30000&timestamp=1753244327210" | openssl dgst -sha256 -hmac "Avqz4IQjoZSJOowMFSo3QZEd4ovfwLH7Kie8ZliTtP8ktDnqcX8bpCP7WluFtrfn"
```

输出：
```
SHA2-256(stdin)= 8346d214e0da7165a0093043395f67e08c63f61b5d6e25779d513c11450e691b
```

## 实时订阅/取消订阅

建立连接后，您可以通过WebSocket发送JSON消息来订阅或取消订阅频道（支持用 `|` 分隔的多个频道）。

### 订阅

**请求**
```json
{
  "command": "SUBSCRIBE",
  "value": "topic1"
}
```

**响应**
```json
{
  "type": "COMMAND",
  "data": "SUCCESS",
  "subType": "SUBSCRIBE",
  "code": "00000000"
}
```

### 取消订阅

**请求**
```json
{
  "command": "UNSUBSCRIBE",
  "value": "topic1"
}
```

**响应**
```json
{
  "type": "COMMAND",
  "data": "SUCCESS",
  "subType": "UNSUBSCRIBE",
  "code": "00000000"
}
```

## WebSocket API 编码示例

### JavaScript 脚本

```javascript
const WebSocket = require('ws');
const CryptoJS = require('crypto-js');

const uri = 'wss://api.binance.com/sapi/wss?random=56724ac693184379ae23ffe5e910063c&topic=topic1&recvWindow=30000&timestamp=${timestamp}&signature=${signature}';
const binance_api_key = "Replace with your API Key";
const binance_api_secret = "Load your Secret Key"; // Load private key

const ts = Date.now();
let paramsObject = {};
const queryString = uri.substring(uri.indexOf('?') + 1);
const parameters = queryString.split('&')
    .filter(param => param.includes('='))
    .map(param => {
        const [key, value] = param.split('=');
        return {key, value};
    });
parameters.map((param) => {
    if (param.key !== 'signature' &&
        param.key !== 'timestamp') {
        paramsObject[param.key] = param.value;
    }
})
Object.assign(paramsObject, {'timestamp': ts});

const tmp = Object.keys(paramsObject).map((key) => {
    return `${key}=${paramsObject[key]}`;
}).join('&');
const signature = CryptoJS.HmacSHA256(tmp, binance_api_secret).toString();
Object.assign(paramsObject, {'signature': signature});
const result = Object.keys(paramsObject).map((key) => {
    return `${key}=${paramsObject[key]}`;
}).join('&');

const baseUri = uri.substring(0, uri.indexOf("?"))
console.log("final uri: " + baseUri + '?' + result)
const ws = new WebSocket(baseUri + '?' + result, [], {
  headers: {
    "X-MBX-APIKEY": binance_api_key
  }
});
ws.on('open', function open() {
    console.log('Connected to the server');
});
ws.on('message', function incoming(data) {
    console.log(`Data from server: ${data}`);
});
ws.on('close', function close() {
    console.log('Disconnected from server');
});
ws.on('error', function error(err) {
    console.error(`Error: ${err.message}`);
});
// TODO setup your ping and reconnect logic
```

## 公告

当币安发布英文公告（语言代码：en）时，订阅用户将收到推送通知。

### 主题
```
com_announcement_en
```

### 响应内容

由于公告长度较长，示例使用 `...` 表示省略的部分。

### 完整响应示例

```json
{
  "type": "DATA",
  "topic": "com_announcement_en",
  "data": "{\"catalogId\":161,\"catalogName\":\"Delisting\",\"publishDate\":1753257631403,\"title\":\"Notice of...\",\"body\":\"This is...\",\"disclaimer\":\"Trade on-the-go...\"}"
}
```

### 公告内容说明

详细的公告内容包含在 `data` 字段中。字符串反转义后，结构如下：

```json
{
    "catalogId": 161,                     // 目录ID
    "catalogName": "Delisting",           // 目录名称
    "publishDate": 1753257631403,         // 发布时间戳（毫秒）
    "title": "Notice of...",              // 公告标题
    "body": "This is...",                 // 公告正文
    "disclaimer": "Trade on-the-go..."    // 免责声明
}
```