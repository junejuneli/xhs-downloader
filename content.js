/**
 * 内容脚本 - 负责注入页面脚本和处理下载
 */

console.log('[VideoAnalyzer Content] 准备注入脚本...');

// 创建script标签注入代码
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  console.log('[VideoAnalyzer Content] 脚本注入成功');
  this.remove();
};

// 注入脚本到页面
(document.head || document.documentElement).appendChild(script);

// 监听来自页面的消息
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  // 处理下载请求
  if (event.data && event.data.type === 'VIDEO_ANALYZER_DOWNLOAD') {
    const { url, filename, requestId } = event.data.payload;
    console.log('[VideoAnalyzer Content] 收到下载请求:', { url, filename });
    
    // 发送到background script处理
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_FILE',
      url: url,
      filename: filename
    }, (response) => {
      // 将结果发送回页面
      window.postMessage({
        type: 'VIDEO_ANALYZER_DOWNLOAD_RESULT',
        payload: {
          success: response?.success || false,
          error: response?.error || null,
          requestId: requestId
        }
      }, '*');
    });
  }
});