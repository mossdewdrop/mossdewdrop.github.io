## Dev Image Tools

一个轻量级的静态 Web 图像工具箱。项目通过 `menu.json` 生成左侧菜单，并将每个工具页面以 iframe 的方式加载到右侧工作区；每个工具都是独立目录/独立页面，便于扩展与部署（例如 GitHub Pages）。

## 项目结构

- [index.html](index.html)：主框架页面（左侧菜单 + 右侧 iframe 工作区）。
- [menu.json](menu.json)：工具注册表（菜单配置与路由入口）。
- [assets/css/style.css](assets/css/style.css)：主框架样式。
- [assets/js/main.js](assets/js/main.js)：读取 `menu.json` 构建菜单，并把工具页面加载到 iframe。
- `functions/`：工具集合。每个工具一个独立目录（通常包含 `index.html`，以及可选的 JS/CSS）。

## 已构建的功能（Tools）

所有功能入口都在 [menu.json](menu.json) 中配置。

- **Channel Merger**（通道合成）：将最多 4 张输入图的 R/G/B/A 通道按配置合成到一张图，支持预览并按指定分辨率导出 PNG。
- **Image 2 SDF**：批量把输入图转换为 SDF（Signed Distance Field）纹理，使用 Web Worker 处理；支持输入反转、输出分辨率、最大距离等参数。
- **Gradient Tools**：多行渐变编辑器；可增删行、拖拽排序、编辑颜色节点；将结果烘焙成图片，并把配置写入 PNG 元数据以便下次拖入加载。
- **Separate Objects**：从含多个不透明区域的图片中自动分析独立区域；可删除/多选/合并区域框；最终将所有区域导出为 ZIP。
- **Image Alpha Fill**：对透明区域填充 RGB（从邻近不透明像素扩散），用于减少边缘发黑/彩边等问题；保存时保留原始 Alpha（RGB 不被清空）。
- **Crop Image**：Ctrl/Cmd + 鼠标拖拽创建多个矩形选区，并将每个选区分别导出为 PNG。
- **Batch Resize Images**：批量缩放图片到多个预设/自定义分辨率；支持按最长边/最短边/宽/高匹配；结果打包为 ZIP 下载。
- **About**：说明该项目基于 JSON 配置、易于新增工具页面。

## 如何运行

主页面通过 `fetch('menu.json')` 读取配置，因此不要直接双击打开 `index.html`，请使用本地静态服务器启动。

- Python（推荐）：

```bash
python -m http.server 8000
```

浏览器打开 `http://localhost:8000/`。

## 如何扩展（新增工具）

- 在 `functions/` 下创建新目录并添加 `index.html`（以及可选的 JS/CSS）。
- 在 [menu.json](menu.json) 中新增条目，填写 `name` 与 `path`（指向该目录）。
