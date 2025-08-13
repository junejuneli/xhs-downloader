/**
 * 注入到页面上下文的脚本
 */
(function () {
  'use strict';

  // 工具函数
  const cutString = (s_text, s_start, s_end, i_start = 0) => {
    i_start = s_text.indexOf(s_start, i_start);
    if (i_start === -1) return '';
    i_start += s_start.length;
    const i_end = s_text.indexOf(s_end, i_start);
    if (i_end === -1) return '';
    return s_text.substring(i_start, i_end);
  };

  const flattenArray = arr => {
    if (!Array.isArray(arr)) return [];
    let result = [];
    for (let i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        result = result.concat(flattenArray(arr[i]));
      } else {
        result.push(arr[i]);
      }
    }
    return result;
  };

  const toArr = arr => Array.isArray(arr) ? arr : [arr];

  const safeFileName = str => {
    if (!str) return 'untitled';
    // 移除或替换所有可能导致问题的字符
    return str
      .replace(/[\r\n]+/g, ' ')           // 替换换行符
      .replace(/[<>:"/\\|?*]+/g, '_')     // 替换Windows不允许的字符
      .replace(/[\x00-\x1f\x80-\x9f]/g, '') // 移除控制字符
      .replace(/^\.+/, '')                // 移除开头的点
      .replace(/\.+$/, '')                // 移除结尾的点
      .replace(/\s+/g, ' ')               // 多个空格替换为单个
      .trim()                             // 去除首尾空格
      .substring(0, 200) || 'untitled';   // 限制长度，确保不为空
  };

  const getExtName = name => {
    switch (name) {
      case 'video': return 'mp4';
      case 'image':
      case 'photo': return 'jpg';
      default: return name || 'mp4';
    }
  };

  // 主分析器
  const analyzer = {
    resources: [],
    inited: false,

    // 平台配置 - 只支持小红书
    HOSTS: {
      'www.xiaohongshu.com': {
        title: '小红书',
        id: 'xhs',
        // 页面类型检测
        getPageType: () => {
          const path = location.pathname;
          if (/^\/explore\/[a-zA-Z0-9]+/.test(path)) {
            return 'detail'; // 详情页
          } else if (/^\/explore/.test(path)) {
            return 'list'; // 列表页
          }
          return 'other';
        },
        // 检查是否为详情页（只有详情页才能捕获内容）
        isDetailPage: () => {
          const path = location.pathname;
          return /^\/explore\/[a-zA-Z0-9]+/.test(path);
        },
        // 获取当前页面的内容ID
        getCurrentId: () => {
          const match = location.pathname.match(/^\/explore\/([a-zA-Z0-9]+)/);
          return match ? match[1] : null;
        },
        getVideoURL: item => new Promise(resolve => {
          fetch(item.url).then(resp => resp.text()).then(text => {
            const json = JSON.parse(cutString(text, '"noteDetailMap":', ',"serverRequestInfo":'));
            
            // 安全检查
            if (!json || !json[item.id] || !json[item.id].note) {
              // console.warn('[VideoAnalyzer] 无法获取笔记详情', item.id, json);
              resolve(null);
              return;
            }
            
            const note = json[item.id].note;
            Object.assign(item, { 
              create_time: note.time || Date.now(), 
              meta: note 
            });
            console.log('[VideoAnalyzer] 获取到小红书详情:', note);

            // 根据note.type判断是视频还是图文
            if (note.type === 'video' && note.video && note.video.media && note.video.media.stream) {
              // 视频类型
              item.type = 'video';
              const stream = note.video.media.stream;
              const videoUrl = (stream.h265 && stream.h265[0] && stream.h265[0].masterUrl) ||
                (stream.h264 && stream.h264[0] && stream.h264[0].masterUrl);
              if (videoUrl) {
                resolve({ url: videoUrl, type: 'video' });
              } else {
                console.warn('[VideoAnalyzer] 视频URL未找到', note);
                resolve(null);
              }
            } else if (note.imageList && note.imageList.length > 0) {
              // 图文类型
              item.type = 'photo';
              resolve(note.imageList.map(({ urlDefault }) => ({ url: urlDefault, type: 'photo' })));
            } else {
              console.log('[VideoAnalyzer] 内容类型未识别或无可用资源', note);
              resolve(null);
            }
          }).catch(err => {
            console.error('[VideoAnalyzer] 获取详情失败:', err);
            resolve(null);
          });
        }),
        rules: [
          {
            type: 'object',
            getObject: window => {
              // 探索页面详情
              if (location.href.startsWith('https://www.xiaohongshu.com/explore/')) {
                return window?.__INITIAL_STATE__?.note?.noteDetailMap;
              }
              return {};
            },
            parseList: json => {
              const list = Object.values(json).filter(({ note }) => note).map(({ note }) => note);
              return list;
            },
            parseItem: data => {
              const { desc, imageList = [], noteId, id, time, user, title, type, video } = data;
              const noteIdFinal = noteId || id;
              const images = imageList.map(({ urlDefault }) => ({ url: urlDefault, type: 'photo' }));

              // 判断是视频还是图文
              const isVideo = type === 'video' || (video && video.media);
              let urls = images; // 默认为图片
              if (isVideo && video && video.media && video.media.stream) {
                const stream = video.media.stream;
                const videoUrl = (stream.h265 && stream.h265[0] && stream.h265[0].masterUrl) ||
                  (stream.h264 && stream.h264[0] && stream.h264[0].masterUrl);
                if (videoUrl) {
                  urls = videoUrl;
                }
              }

              return {
                id: noteIdFinal,
                url: `https://www.xiaohongshu.com/explore/${noteIdFinal}`,
                urls,
                cover: images[0]?.url || video?.cover,
                title: desc || title,
                author_name: user?.nickname,
                create_time: time,
                type: isVideo ? 'video' : 'photo',
                data
              };
            }
          },
          {
            type: 'object',
            getObject: window => {
              // 选择有数据的源
              const sources = [
                window?.__INITIAL_STATE__?.user?.notes?._rawValue,
                window?.__INITIAL_STATE__?.search?.feeds?._rawValue,
                window?.__INITIAL_STATE__?.feed?.feeds?._rawValue
              ];

              for (const source of sources) {
                if (source && flattenArray(source).length > 0) {
                  return source;
                }
              }
              return null;
            },
            parseList: json => {
              const list = [];
              if (Array.isArray(json)) {
                json.forEach(items => {
                  if (Array.isArray(items)) {
                    items.forEach(item => {
                      if (item.noteCard) list.push(item);
                    });
                  } else if (items?.noteCard) {
                    list.push(items);
                  }
                });
              }
              return list;
            },
            parseItem: data => {
              const { cover, displayTitle, noteId, type, user } = data?.noteCard || {};
              const id = noteId || data.id;

              if (!id) return null;

              const contentType = type === 'video' ? 'video' : 'photo';

              return {
                id,
                url: `https://www.xiaohongshu.com/explore/${id}`,
                cover: cover?.urlDefault,
                title: (displayTitle || '').replace(/🥹/g, ''),
                author_name: user?.nickname,
                type: contentType,
                data
              };
            }
          }
        ]
      }
    },

    init() {
      const hostname = location.hostname;
      this.DETAIL = this.HOSTS[hostname];

      if (!this.DETAIL) {
        console.log('[VideoAnalyzer] 当前网站不支持');
        return;
      }

      // 获取页面类型
      this.pageType = this.DETAIL.getPageType ? this.DETAIL.getPageType() : 'other';
      console.log('[VideoAnalyzer] 页面类型:', this.pageType);

      // 只在详情页和列表页显示UI，但只在详情页捕获内容
      if (this.pageType === 'other') {
        console.log('[VideoAnalyzer] 当前页面类型不支持');
        return;
      }

      console.log('[VideoAnalyzer] 检测到平台:', this.DETAIL.title);

      // 保存原始函数
      this.originalParse = JSON.parse;
      this.originalSend = XMLHttpRequest.prototype.send;
      this.originalFetch = window.fetch;

      // 只在详情页开始hook和捕获内容
      if (this.pageType === 'detail') {
        // 开始hook
        this.hook();

        // 定期检查页面数据
        setInterval(() => this.hook(), 250);
      }
    },

    hook() {
      const json_callbacks = [];
      const network_callbacks = [];

      this.DETAIL.rules.forEach((rule, rule_index) => {
        const callback = json => {
          try {
            const list = (rule.parseList(json) || []);
            const items = flattenArray(list.map(item => toArr(rule.parseItem(item))));
            
            // 只保留当前页面对应的内容
            let filteredItems = items;
            if (this.DETAIL.getCurrentId) {
              const currentId = this.DETAIL.getCurrentId();
              if (currentId) {
                filteredItems = items.filter(item => item && item.id === currentId);
              }
            }
            
            const newItems = filteredItems.filter(item => {
              return item && item.id && !this.resources.find(r => r.id === item.id);
            });

            if (newItems.length > 0) {
              this.resources.push(...newItems.map(item => Object.assign(item, { rule_index })));
              console.log(`[VideoAnalyzer] 捕获到 ${newItems.length} 个新内容`);
              newItems.forEach(item => this.outputItem(item));
            }
          } catch (err) {
            console.error('[VideoAnalyzer] 解析错误:', err);
          }
        };

        switch (rule.type) {
          case 'object':
            const obj = rule.getObject(window);
            if (obj) callback(obj);
            break;
          case 'json':
            json_callbacks.push(json => callback(Object.assign({}, json)));
            break;
          case 'network':
            network_callbacks.push({ url: rule.url, callback });
            break;
        }
      });

      // Hook JSON.parse
      if (json_callbacks.length && !this.jsonHooked) {
        this.jsonHooked = true;
        const originalParse = this.originalParse;
        JSON.parse = function (...args) {
          const json = originalParse.apply(JSON, args);
          json_callbacks.forEach(cb => cb(json));
          return json;
        };
      }

      // Hook XMLHttpRequest
      if (network_callbacks.length && !this.xhrHooked) {
        this.xhrHooked = true;
        const originalSend = this.originalSend;
        XMLHttpRequest.prototype.send = function () {
          this.addEventListener('load', function () {
            if (['', 'text'].includes(this.responseType)) {
              network_callbacks.forEach(({ url, callback }) => {
                if (new RegExp(url).test(this.responseURL)) {
                  try {
                    const raw = this.responseText;
                    if (raw && (raw.startsWith('{') || raw.startsWith('['))) {
                      callback(JSON.parse(raw));
                    }
                  } catch (e) { }
                }
              });
            }
          });
          originalSend.apply(this, arguments);
        };
      }

      // Hook fetch
      if (network_callbacks.length && !this.fetchHooked) {
        this.fetchHooked = true;
        const originalFetch = this.originalFetch;
        window.fetch = function () {
          return originalFetch.apply(this, arguments).then(response => {
            if (response.status === 200) {
              response.clone().text().then(raw => {
                network_callbacks.forEach(({ url, callback }) => {
                  if (new RegExp(url).test(response.url)) {
                    try {
                      if (raw && (raw.startsWith('{') || raw.startsWith('['))) {
                        callback(JSON.parse(raw));
                      }
                    } catch (e) { }
                  }
                });
              });
            }
            return response;
          });
        };
      }
    },

    async outputItem(item) {
      // 如果需要获取详细信息
      if (!item.urls && this.DETAIL.getVideoURL) {
        const urls = await this.DETAIL.getVideoURL(item);
        if (urls) {
          item.urls = urls;
          // getVideoURL可能会更新item.type，所以这里不需要额外处理
        }
      }

      // 确定内容类型
      let contentType = item.type;
      if (Array.isArray(item.urls) && item.urls.length > 0 && item.urls[0].type === 'photo') {
        contentType = 'photo';
        item.type = 'photo';
      } else if (typeof item.urls === 'object' && item.urls?.type) {
        contentType = item.urls.type;
        item.type = item.urls.type;
      }

      // 构建下载选项
      const downloadOpts = {
        id: item.id,
        url: item.urls || item.url,
        name: safeFileName(item.title || '无标题'),
        download: {
          ext: getExtName(contentType || 'video'),
          type: contentType || 'video',
          title: item.title || '无标题'
        }
      };

      const typeLabel = contentType === 'photo' ? '图文' : '视频';
      console.log(`%c[VideoAnalyzer] 发现${typeLabel}内容:`, 'color: #4CAF50; font-weight: bold', downloadOpts);

      // 如果是多个资源（图文）
      if (Array.isArray(item.urls)) {
        console.log(`%c[VideoAnalyzer] 包含 ${item.urls.length} 张图片`, 'color: #2196F3');
        item.urls.forEach((urlItem, index) => {
          console.log(`  图片 ${index + 1}: ${urlItem.url}`);
        });
      }
    }
  };

  // 初始化
  analyzer.init();

  // 导出到全局
  window.videoAnalyzer = analyzer;

  // 监听URL变化（单页应用）
  let lastUrl = location.href;
  let wasOnListPage = false;
  let openedFromListPage = false;
  
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      const previousPageType = analyzer.pageType;
      lastUrl = url;
      console.log('[VideoAnalyzer] URL变化，重新检查是否需要激活');
      
      // 检查是否从列表页打开了详情页
      if (previousPageType === 'list' && /^\/explore\/[a-zA-Z0-9]+/.test(location.pathname)) {
        openedFromListPage = true;
        console.log('[VideoAnalyzer] 从列表页打开了详情页');
      } else if (previousPageType === 'detail' && /^\/explore$/.test(location.pathname)) {
        openedFromListPage = false;
        console.log('[VideoAnalyzer] 从详情页返回到列表页');
      }
      
      // 重置状态
      analyzer.resources = [];
      analyzer.inited = false;
      
      // 移除旧UI
      const oldFab = document.getElementById('va-fab');
      if (oldFab) oldFab.remove();
      const oldOverlay = document.getElementById('va-overlay');
      if (oldOverlay) oldOverlay.remove();
      const oldPanel = document.getElementById('va-panel');
      if (oldPanel) oldPanel.remove();
      
      // 重新初始化
      analyzer.init();
      
      // 重新创建UI（在列表页和详情页都显示）
      if (analyzer.DETAIL && analyzer.pageType && (analyzer.pageType === 'detail' || analyzer.pageType === 'list')) {
        createUI();
      }
    }
  }).observe(document, { subtree: true, childList: true });

  function createUI() {
    // 检查是否已经创建
    if (document.getElementById('va-fab')) {
      return;
    }

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      /* 浮动按钮 */
      #va-fab {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        cursor: pointer;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
        font-size: 12px;
        font-weight: bold;
        animation: va-pulse 2s infinite;
      }

      /* 列表页状态 - 未激活 */
      #va-fab.list-mode {
        background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
        opacity: 0.7;
        animation: none;
      }

      /* 详情页状态 - 激活 */
      #va-fab.detail-mode {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        opacity: 1;
        animation: va-pulse 2s infinite;
      }
      
      @keyframes va-pulse {
        0% { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        50% { box-shadow: 0 4px 20px rgba(102,126,234,0.4); }
        100% { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      }
      
      #va-fab:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
      }
      
      #va-fab .va-count {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ff4757;
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 10px;
        min-width: 20px;
        text-align: center;
      }
      
      /* 蒙层 */
      #va-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        z-index: 999998;
        display: none;
        animation: va-fadeIn 0.3s ease;
      }
      
      @keyframes va-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      /* 主面板 */
      #va-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 800px;
        height: 80%;
        max-height: 600px;
        background: white;
        border-radius: 12px;
        z-index: 999999;
        display: none;
        flex-direction: column;
        animation: va-slideIn 0.3s ease;
      }
      
      @keyframes va-slideIn {
        from { transform: translate(-50%, -45%); opacity: 0; }
        to { transform: translate(-50%, -50%); opacity: 1; }
      }
      
      /* 头部 */
      .va-header {
        padding: 20px;
        border-bottom: 1px solid #e1e8ed;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 12px 12px 0 0;
      }
      
      .va-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .va-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.3s ease;
      }
      
      .va-close:hover {
        background: rgba(255,255,255,0.3);
        transform: rotate(90deg);
      }
      
      /* 标签页 */
      .va-tabs {
        display: flex;
        padding: 0 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #e1e8ed;
      }
      
      .va-tab {
        padding: 12px 20px;
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        position: relative;
        transition: all 0.3s ease;
      }
      
      .va-tab.active {
        color: #667eea;
      }
      
      .va-tab.active::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: #667eea;
      }
      
      .va-tab span {
        margin-left: 5px;
        background: #e1e8ed;
        color: #666;
        border-radius: 10px;
        padding: 2px 8px;
        font-size: 12px;
      }
      
      .va-tab.active span {
        background: #667eea;
        color: white;
      }
      
      /* 内容区 */
      .va-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      
      /* 列表项 */
      .va-item {
        display: flex;
        align-items: center;
        padding: 12px;
        margin-bottom: 10px;
        background: #f8f9fa;
        border-radius: 8px;
        transition: all 0.3s ease;
      }
      
      .va-item:hover {
        background: #e9ecef;
        transform: translateX(5px);
      }
      
      .va-item-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 12px;
        font-size: 20px;
        overflow: hidden;
        position: relative;
      }
      
      .va-item-icon.video {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .va-item-icon.photo {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
      }

      .va-item-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 8px;
        transition: transform 0.2s ease;
      }

      .va-item:hover .va-item-icon img {
        transform: scale(1.05);
      }

      .va-item-icon .va-icon-fallback {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 20px;
        color: white;
        z-index: 1;
      }
      
      .va-item-info {
        flex: 1;
        min-width: 0;
      }
      
      .va-item-title {
        font-size: 14px;
        font-weight: 500;
        color: #333;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .va-item-url {
        font-size: 12px;
        color: #999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 400px;
      }
      
      .va-download {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.3s ease;
        white-space: nowrap;
      }
      
      .va-download:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(102,126,234,0.3);
      }
      
      .va-download:active {
        transform: scale(0.98);
      }
      
      .va-download.downloading {
        background: #95a5a6;
        cursor: not-allowed;
      }
      
      .va-download.success {
        background: linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%);
      }
      
      .va-download.error {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      }
      
      /* 空状态 */
      .va-empty {
        text-align: center;
        padding: 40px;
        color: #999;
      }
      
      .va-empty-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }
      
      .va-empty-text {
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);

    // 创建浮动按钮
    const fab = document.createElement('button');
    fab.id = 'va-fab';
    
    // 根据页面类型设置不同的状态
    const pageType = analyzer.pageType;
    if (pageType === 'list') {
      fab.className = 'list-mode';
    } else if (pageType === 'detail') {
      fab.className = 'detail-mode';
    }
    
    fab.innerHTML = `
      <span>${analyzer.DETAIL?.title || 'VA'}</span>
      <span class="va-count" style="display:none">0</span>
    `;
    document.body.appendChild(fab);

    // 创建蒙层
    const overlay = document.createElement('div');
    overlay.id = 'va-overlay';
    document.body.appendChild(overlay);

    // 创建主面板
    const panel = document.createElement('div');
    panel.id = 'va-panel';
    panel.innerHTML = `
      <div class="va-header">
        <h2>🎬 视频链接分析器 - ${analyzer.DETAIL?.title || '未知平台'}</h2>
        <button class="va-close">✕</button>
      </div>
      <div class="va-tabs">
        <button class="va-tab active" data-type="all">
          全部 <span>0</span>
        </button>
        <button class="va-tab" data-type="video">
          视频 <span>0</span>
        </button>
        <button class="va-tab" data-type="photo">
          图片 <span>0</span>
        </button>
      </div>
      <div class="va-content">
        <div class="va-empty">
          <div class="va-empty-icon">📭</div>
          <div class="va-empty-text">暂无捕获的内容，请浏览页面以捕获数据</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 更新计数器
    function updateCounter() {
      const count = analyzer.resources.length;
      const counter = fab.querySelector('.va-count');
      const pageType = analyzer.pageType;
      
      // 只在详情页显示角标
      if (pageType === 'detail' && count > 0) {
        counter.style.display = 'block';
        counter.textContent = count > 99 ? '99+' : count;
      } else {
        counter.style.display = 'none';
      }

      // 更新标签计数
      const all = analyzer.resources.length;
      const videos = analyzer.resources.filter(r => {
        if (r.type === 'video') return true;
        if (r.type === 'photo') return false;
        // 如果类型不明确，检查urls结构
        return !Array.isArray(r.urls);
      }).length;
      const photos = analyzer.resources.filter(r => {
        if (r.type === 'photo') return true;
        if (r.type === 'video') return false;
        // 如果类型不明确，检查urls结构
        return Array.isArray(r.urls);
      }).length;

      panel.querySelector('[data-type="all"] span').textContent = all;
      panel.querySelector('[data-type="video"] span').textContent = videos;
      panel.querySelector('[data-type="photo"] span').textContent = photos;
    }

    // 渲染列表
    function renderList(type = 'all') {
      const content = panel.querySelector('.va-content');
      let items = analyzer.resources;

      if (type === 'video') {
        items = items.filter(r => {
          // 检查是否真的是视频
          if (r.type === 'video') return true;
          if (r.type === 'photo') return false;
          // 如果没有明确类型，检查urls
          if (Array.isArray(r.urls)) return false; // 数组通常是图片
          return true;
        });
      } else if (type === 'photo') {
        items = items.filter(r => {
          // 检查是否真的是图片
          if (r.type === 'photo') return true;
          if (r.type === 'video') return false;
          // 如果没有明确类型，检查urls
          if (Array.isArray(r.urls)) return true; // 数组通常是图片
          return false;
        });
      }

      if (items.length === 0) {
        content.innerHTML = `
          <div class="va-empty">
            <div class="va-empty-icon">📭</div>
            <div class="va-empty-text">暂无${type === 'all' ? '' : type === 'video' ? '视频' : '图片'}内容</div>
          </div>
        `;
        return;
      }

      content.innerHTML = items.map(item => {
        // 更准确地判断内容类型
        let isPhoto = item.type === 'photo';
        if (!item.type && Array.isArray(item.urls)) {
          isPhoto = true; // 数组形式的urls通常是图片
        }

        const urls = Array.isArray(item.urls) ? item.urls : [item.urls || item.url];

        return urls.map((url, index) => {
          const finalUrl = typeof url === 'object' ? url.url : url;
          const urlType = typeof url === 'object' ? url.type : item.type;
          const isThisPhoto = urlType === 'photo' || isPhoto;

          // 确定文件扩展名
          const ext = isThisPhoto ? '.jpg' : '.mp4';

          // 生成图标内容
          let iconContent;
          if (isThisPhoto) {
            iconContent = `
              <img src="${finalUrl}" alt="预览图" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
              <div class="va-icon-fallback" style="display:none;">🖼️</div>
            `;
          } else {
            iconContent = '🎥';
          }

          return `
            <div class="va-item">
              <div class="va-item-icon ${isThisPhoto ? 'photo' : 'video'}">
                ${iconContent}
              </div>
              <div class="va-item-info">
                <div class="va-item-title">${item.title || '无标题'}${urls.length > 1 ? ` (${index + 1}/${urls.length})` : ''}</div>
                <div class="va-item-url" title="${finalUrl}">${finalUrl || item.url}</div>
              </div>
              <button class="va-download" 
                      data-url="${finalUrl}" 
                      data-title="${item.title || '无标题'}_${index + 1}"
                      data-ext="${ext}">
                下载
              </button>
            </div>
          `;
        }).join('');
      }).join('');

      // 绑定下载事件
      content.querySelectorAll('.va-download').forEach(btn => {
        btn.addEventListener('click', handleDownload);
      });
    }

    // 处理下载
    async function handleDownload(e) {
      const btn = e.target;
      const url = btn.dataset.url;
      const title = btn.dataset.title || '未命名';
      const ext = btn.dataset.ext || '.mp4';

      if (btn.classList.contains('downloading')) return;

      btn.classList.add('downloading');
      btn.textContent = '下载中...';

      try {
        // 获取安全的文件名
        let filename = safeFileName(title);
        // 确保文件名不为空
        if (!filename || filename.length === 0) {
          filename = 'download_' + Date.now();
        }
        // 添加扩展名
        filename = filename + ext;

        console.log('[VideoAnalyzer] 下载文件:', { url, filename });

        // 尝试通过消息传递使用Chrome扩展API下载
        try {
          const requestId = Date.now() + '_' + Math.random();

          await new Promise((resolve, reject) => {
            // 设置消息监听器
            const handleMessage = (event) => {
              if (event.data &&
                event.data.type === 'VIDEO_ANALYZER_DOWNLOAD_RESULT' &&
                event.data.payload.requestId === requestId) {
                window.removeEventListener('message', handleMessage);
                if (event.data.payload.success) {
                  resolve();
                } else {
                  reject(new Error(event.data.payload.error || '下载失败'));
                }
              }
            };

            window.addEventListener('message', handleMessage);

            // 发送下载请求
            window.postMessage({
              type: 'VIDEO_ANALYZER_DOWNLOAD',
              payload: {
                url: url,
                filename: filename,
                requestId: requestId
              }
            }, '*');

            // 设置超时
            setTimeout(() => {
              window.removeEventListener('message', handleMessage);
              reject(new Error('下载超时'));
            }, 10000);
          });

          btn.classList.add('success');
          btn.textContent = '✓ 成功';
          setTimeout(() => {
            btn.classList.remove('downloading', 'success');
            btn.textContent = '下载';
          }, 1500);
          return;
        } catch (err) {
          console.log('[VideoAnalyzer] Chrome API下载失败，尝试直接下载:', err);
        }


        // 回退方案：通过fetch获取blob避免URL跳转
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = filename;
          a.style.display = 'none';

          // 添加到body，点击，然后移除
          document.body.appendChild(a);
          a.click();

          // 延迟移除和清理对象URL
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
          }, 100);
        } catch (fetchError) {
          console.log('[VideoAnalyzer] Fetch下载失败，使用直接链接:', fetchError);
          
          // 最后的回退方案：直接链接（可能导致跳转）
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.target = '_blank'; // 在新标签页打开，避免当前页面跳转
          a.style.display = 'none';

          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            document.body.removeChild(a);
          }, 100);
        }

        // 更新按钮状态
        btn.classList.add('success');
        btn.textContent = '✓ 已触发';
        setTimeout(() => {
          btn.classList.remove('downloading', 'success');
          btn.textContent = '下载';
        }, 1500);

      } catch (error) {
        console.error('[VideoAnalyzer] 下载错误:', error);
        btn.classList.add('error');
        btn.textContent = '✗ 失败';
        setTimeout(() => {
          btn.classList.remove('downloading', 'error');
          btn.textContent = '重试';
        }, 2000);
      }
    }

    // 事件绑定
    fab.addEventListener('click', () => {
      const pageType = analyzer.pageType;
      
      // 如果在列表页，新开标签页打开当前URL
      if (pageType === 'list') {
        window.open(location.href, '_blank');
        return;
      }
      
      // 如果在详情页且是从列表页打开的，新开标签页
      if (pageType === 'detail' && openedFromListPage) {
        window.open(location.href, '_blank');
        return;
      }
      
      // 详情页正常打开面板
      overlay.style.display = 'block';
      panel.style.display = 'flex';
      updateCounter();
      renderList();
    });

    overlay.addEventListener('click', () => {
      overlay.style.display = 'none';
      panel.style.display = 'none';
    });

    panel.querySelector('.va-close').addEventListener('click', () => {
      overlay.style.display = 'none';
      panel.style.display = 'none';
    });

    // 标签切换
    panel.querySelectorAll('.va-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.va-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderList(tab.dataset.type);
      });
    });

    // 定期更新计数
    setInterval(updateCounter, 1000);

    // 修改原始outputItem函数，添加UI更新
    const originalOutputItem = analyzer.outputItem;
    analyzer.outputItem = async function (item) {
      await originalOutputItem.call(this, item);
      updateCounter();
    };

  }

  // 创建UI（在列表页和详情页都显示）
  if (analyzer.DETAIL && analyzer.pageType && (analyzer.pageType === 'detail' || analyzer.pageType === 'list')) {
    createUI();
  }
})();