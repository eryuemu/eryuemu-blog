# WSL2 与 Windows 宿主机网络通信 & Git 代理配置指南（AI 共享规范）

> **文档目的**：供后续所有 AI 助手（Antigravity / Claude / Cursor 等）与开发者共享参考，避免在 WSL2 与 Windows 宿主机之间的网络交互、代理配置及 Git 操作中重复踩坑。

---

## 一、网络拓扑与架构现状

1. **虚拟网络与网段**：
   - WSL2 运行在 Hyper-V 轻量级虚拟机中，通过虚拟交换机与 Windows 宿主机通信；
   - 宿主机网关 IP（通常为 `172.x.x.1`，如 `172.29.80.1`）在不同 Wi-Fi / 重启后可能发生动态漂移；
   - Windows 宿主机的 Clash / 代理客户端监听在 `7892`（HTTP 混合代理端口）或 `7890`（SOCKS5 端口）。

2. **当前基准配置**：
   - WSL2 通过宿主机虚拟网卡直接访问外网；
   - Git 仓库远程地址：`https://github.com/eryuemu/eryuemu-blog.git`（HTTPS 协议）。

---

## 二、核心历史踩坑记录与根本原因

### 🔴 经典陷阱：GnuTLS 与 HTTP 代理的 TLS 1.3 握手 Bug

* **现象**：在 WSL2 终端中通过 `curl -x http://172.29.80.1:7892 https://github.com` 测试完全正常，但在执行 `git push` 或 `git fetch` 时，必定卡在 TLS 握手最后一步并报错：
  ```text
  fatal: unable to access 'https://github.com/...': GnuTLS, handshake failed: The TLS connection was non-properly terminated.
  ```
* **根本原因**：
  1. Ubuntu / Debian 官方源的 `git` 底层网络库编译绑定的是 **GnuTLS**（而非 OpenSSL）；
  2. 当 Git 配置了 HTTP 代理（`http.proxy=http://172.29.80.1:7892`）时，Git 会先发送 `HTTP CONNECT` 建立隧道；
  3. 隧道建立后，GnuTLS 与 GitHub 进行 TLS 1.3 握手，因 GnuTLS 内部处理 ALPN / Session Ticket 的兼容缺陷，在经过代理转发时连接被非正常掐断。

### 🔴 陷阱二：宿主机 IP 硬编码漂移

* **现象**：将 `http.proxy=http://172.29.80.1:7892` 写入 `~/.gitconfig` 全局配置后，系统重启或切换网络后 `git push` 无限挂起超时。
* **根本原因**：宿主机虚拟 IP 发生变动，硬编码的旧 IP 变为黑洞。

---

## 三、当前推荐的黄金实践（AI 操作必读）

### 1. Git 代理配置：保持清空（UNSET）

> 💡 **核心原则**：**不要在 WSL 全局 `.gitconfig` 或本地仓库中配置 `http.proxy` / `https.proxy`！**

* **标准状态**：
  ```bash
  # 确保全局与局部 proxy 均未设置
  git config --global --unset http.proxy
  git config --global --unset https.proxy
  git config --unset http.proxy
  git config --unset https.proxy
  ```
* **原理解释**：不设代理时，Git 请求直接走系统底层网络路由，完全避开 GnuTLS 的代理握手 Bug，`git fetch` 与 `git push` 均可实现毫秒级直连推送。

### 2. 如果未来遇到网络完全不通时的应急方案

如果某天因网络波动导致 GitHub 直连受阻，**绝不要**直接用 `git config --global http.proxy`，而是采用以下临时单次调用方式：

* **方案 A：单次命令指定 SOCKS5（推荐，避开 GnuTLS CONNECT Bug）**：
  ```bash
  # 获取当前宿主机动态网关 IP 并单次执行
  HOST_IP=$(ip route | grep default | awk '{print $3}')
  git -c http.proxy="socks5://${HOST_IP}:7890" push origin main
  ```
* **方案 B：使用 SSH 协议替代 HTTPS**：
  配置 `~/.ssh/config` 通过宿主机代理转发 SSH，彻底绕过 GnuTLS。

---

## 四、自检与诊断常用命令

```bash
# 1. 检查当前 Git 是否残留了代理配置
git config -l --show-origin | grep -i proxy

# 2. 获取当前 WSL 宿主机网关真实 IP
ip route | grep default | awk '{print $3}'

# 3. 验证与 GitHub 的直接通信连通性
curl -I https://github.com

# 4. 详细调试 Git 网络握手过程（定位卡点）
GIT_CURL_VERBOSE=1 git fetch
```
