# 默认签名证书

此证书仅用于开发和测试，**生产环境请替换为自己的证书**。

## 证书信息
- 文件: `release.keystore`
- 密码: `android123`
- 别名: `release`
- 密钥密码: `android123`

## 使用自定义证书

通过环境变量覆盖默认配置：

```bash
export KEYSTORE_FILE=/path/to/your.keystore
export KEYSTORE_PASSWORD=your_password
export KEY_ALIAS=your_alias
export KEY_PASSWORD=your_key_password
make release
```
