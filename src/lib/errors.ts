export type ErrorCode =
  | "missing_key"
  | "invalid_request"
  | "invalid_base_url"
  | "blocked_host"
  | "timeout"
  | "provider_error"
  | "network"
  | "aborted"
  | "empty_response";

export const ERROR_TEXT: Record<ErrorCode, string> = {
  missing_key: "尚未配置密钥",
  invalid_request: "请求不合法",
  invalid_base_url: "接口地址无法识别",
  blocked_host: "这个地址不允许由服务器访问",
  timeout: "厂商超时",
  provider_error: "厂商返回错误",
  network: "网络连接失败",
  aborted: "已停止",
  empty_response: "厂商没有返回正文",
};

export function errorTextFor(code: string | undefined): string {
  return (code && ERROR_TEXT[code as ErrorCode]) || ERROR_TEXT.provider_error;
}
