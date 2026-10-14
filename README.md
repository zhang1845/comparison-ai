# 多模型工作台

产品规范见 [SPEC.md](./SPEC.md)。

五席是一个单页工作台：配置最多五个模型席位，用同一个输入框提问，五个模型同时作答，并排看差异。密钥、席位配置和对话记录都只存在这台浏览器里，服务端只转发请求。

## 运行

```bash
npm install
npm run dev
```

开发服务器监听 [http://localhost:3847](http://localhost:3847)。

没有密钥时，点「使用演示回答」即可走通界面，不会访问网络。席位设置里也可以开关演示。

密钥只保存在本机 `localStorage`（`wuxi.secrets.v1`），界面只显示末四位。不要把密钥写进仓库或环境变量。不需要 `.env` 也能跑。

可选环境变量：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `PROXY_TIMEOUT_MS` | `90000` | 上游无活动超时（毫秒） |

```bash
npm test
npm run lint
npm run build
```
