# 图标文件说明

此文件夹包含 Chrome 扩展所需的所有图标文件。

## 文件列表

- `icon.png` - 原始图标文件 (256x256)
- `icon16.png` - 16x16 像素图标
- `icon32.png` - 32x32 像素图标
- `icon48.png` - 48x48 像素图标
- `icon128.png` - 128x128 像素图标

## 使用方法

### 生成不同尺寸的图标

运行目录中的 `generate-icons.sh` 脚本：

```bash
cd icons
./generate-icons.sh
```

脚本会自动从 `icon.png` 生成所有需要的尺寸。

### 更换图标

1. 将新的图标文件替换 `icon.png`（建议使用 256x256 或更高分辨率）
2. 运行 `./generate-icons.sh` 重新生成各种尺寸
3. 重新加载 Chrome 扩展

## 注意事项

- 原始图标建议使用透明背景的 PNG 格式
- 图标应该清晰可辨，在小尺寸下也能识别
- Chrome 会根据不同场景自动选择合适尺寸的图标