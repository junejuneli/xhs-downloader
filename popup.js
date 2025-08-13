/**
 * Popup页面脚本
 */

document.addEventListener('DOMContentLoaded', () => {
  // 获取当前标签页信息
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const statusIndicator = document.querySelector('.status-indicator');
    const statusTitle = document.querySelector('.status-title span:last-child');
    const statusText = document.querySelector('.status-text');
    
    // 检查是否在小红书页面
    if (currentTab.url && currentTab.url.includes('xiaohongshu.com')) {
      statusIndicator.style.background = '#4ade80';
      statusTitle.textContent = '插件已启用';
      statusText.textContent = '在小红书页面中点击浮动按钮即可使用';
    } else {
      statusIndicator.style.background = '#fbbf24';
      statusTitle.textContent = '请访问小红书';
      statusText.textContent = '插件仅在小红书网站上工作';
    }
  });
  
  // 帮助链接
  document.getElementById('help').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: 'https://github.com/yourusername/xhs-downloader#readme'
    });
  });
  
  // 反馈链接
  document.getElementById('feedback').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: 'https://github.com/yourusername/xhs-downloader/issues'
    });
  });
});