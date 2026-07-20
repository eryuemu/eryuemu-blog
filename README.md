# 🌌 eryuemu-blog (二月木的个人博客)

> 🌐 访问地址: [https://eryuemu.com](https://eryuemu.com)

基于 **Astro** 构建的个人极客博客系统。开发环境与 Windows 宿主机完全物理隔离，并依托自定义同步脚本，实现了本地 **Obsidian** 知识库到线上网站的自动化同步与排版转换。

---

## 💎 项目核心设计与特点

* 🔬 **零污染物理隔离**：所有的 Node.js 运行环境（由 nvm 管理）、依赖包及代码仓库均锁定在 **WSL2 (Ubuntu)** 虚拟磁盘中，完美保持 Windows 系统的干净与纯粹。
* 📝 **Obsidian 自动化同步**：通过 `migrate.cjs` 自定义脚本，自动从 Windows 挂载路径读取本地知识库，完成 Frontmatter 重新渲染、内部 `[[WikiLinks]]` 解析重定向以及 `![[Image]]` 图片相对路径改写。
* 🚀 **Vercel 全局加速**：完全托管于 Vercel 全局 CDN 边缘节点，配合自定义域名 `eryuemu.com`，在国内与全球均能享受极致的秒开体验。
* 💬 **动态交互与统计**：
  * **评论系统**：集成 Waline 评论框架（后端依托云端 Supabase 数据库与 Vercel 部署）。
  * **流量计数**：集成 Vercount 实现轻量、精准的页面访问统计。
* ⚡ **极速与 SEO**：基于 Astro 纯静态生成（SSG），配备开箱即用的 Sitemap 和 RSS 订阅支持。

---

## 🛠️ 本地开发与常驻服务管理

博客开发通过 WSL2 中的 Astro 常驻服务进行管理，防止开发服务意外退出：

```bash
# 后台常驻运行本地开发服务器 (默认端口: http://localhost:4321)
npx astro dev --background

# 检查当前服务运行状态
npx astro dev status

# 实时查看本地开发日志
npx astro dev logs

# 停止后台开发服务器
npx astro dev stop
```

---

## 🔄 Obsidian 知识库同步方案

当你在本地 Obsidian 中写完或修改了文章，可以通过以下方式同步到博客：

### 1. 同步机制说明
运行脚本时，它会执行以下管道操作：
1. **源路径扫描**：从挂载的 Windows 本地路径（如 `/mnt/c/MyKnowledgeBase/开发`）读取最新的 Markdown 文档。
2. **Slug 映射解析**：根据 `migrate.cjs` 内置的 `slugMap` 映射表将中文文件名转换为 URL 友好的 slugs。
3. **内容预处理**：
   - 提取原始 Obsidian 的 `created` 日期生成统一的 `pubDate`。
   - 解析 Obsidian 专属的图片语法（如 `![[image.png]]`）并转换为标准的相对路径。
   - 解析 `[[WikiLinks]]` 并自动转换为适配 `eryuemu.com/blog/xxx` 的站内链接。
4. **编译与覆盖**：生成干净标准的 Markdown 格式博客，并写入项目的 `src/content/blog/` 目录中。

### 2. 执行同步命令
在 WSL2 项目根目录下直接运行：
```bash
node migrate.cjs
```

---

## 📦 线上部署工作流

项目已实现 **无感自动化部署**（CI/CD）：

```mermaid
graph LR
    A[Obsidian 编辑] --> B[node migrate.cjs 同步]
    B --> C[Git Push 推送]
    C --> D[Vercel 监听到提交]
    D --> E[Vercel 自动构建/发布]
    E --> F[eryuemu.com 实时更新]
```

当代码被推送到 GitHub 仓库的 `main` 分支时，Vercel 将会自动拉取最新版本进行云端构建，并在 1 分钟内完成全网节点的静默部署。
