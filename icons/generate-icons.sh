#!/bin/bash

# 图标生成脚本
# 用于从原始图标（icon.png）生成不同尺寸的图标文件

# 检查是否存在原始图标文件
if [ ! -f "icon.png" ]; then
    echo "❌ 错误: 找不到 icon.png 文件"
    echo "请确保在 icons 目录下有 icon.png 原始图标文件"
    exit 1
fi

echo "🎨 开始生成不同尺寸的图标..."

# 定义需要生成的图标尺寸
sizes=(16 32 48 128)

# 检测系统类型并选择相应的工具
if command -v sips &> /dev/null; then
    # macOS 系统使用 sips
    echo "📱 检测到 macOS 系统，使用 sips 工具"
    
    for size in "${sizes[@]}"; do
        output_file="icon${size}.png"
        echo "  ⏳ 生成 ${size}x${size} 图标..."
        sips -z $size $size icon.png --out $output_file &> /dev/null
        
        if [ $? -eq 0 ]; then
            echo "  ✅ 已生成: $output_file"
        else
            echo "  ❌ 生成失败: $output_file"
        fi
    done
    
elif command -v convert &> /dev/null; then
    # Linux/Windows (with ImageMagick) 使用 convert
    echo "🖥️  检测到 ImageMagick，使用 convert 工具"
    
    for size in "${sizes[@]}"; do
        output_file="icon${size}.png"
        echo "  ⏳ 生成 ${size}x${size} 图标..."
        convert icon.png -resize ${size}x${size} $output_file
        
        if [ $? -eq 0 ]; then
            echo "  ✅ 已生成: $output_file"
        else
            echo "  ❌ 生成失败: $output_file"
        fi
    done
    
else
    echo "❌ 错误: 未找到图像处理工具"
    echo "请安装以下工具之一:"
    echo "  - macOS: sips (系统自带)"
    echo "  - Linux/Windows: ImageMagick (运行: brew install imagemagick 或 apt-get install imagemagick)"
    exit 1
fi

echo ""
echo "✨ 图标生成完成！"
echo ""
echo "生成的文件:"
for size in "${sizes[@]}"; do
    if [ -f "icon${size}.png" ]; then
        echo "  ✓ icon${size}.png"
    fi
done

echo ""
echo "📝 提示: 这些图标已准备好用于 Chrome 扩展"
echo "        请确保 manifest.json 中正确引用了这些图标路径"