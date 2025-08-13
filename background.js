/**
 * 后台服务脚本 - 处理消息和数据解析
 */

// 平台配置
const PLATFORMS = {
  'www.douyin.com': {
    name: '抖音',
    id: 'douyin',
    rules: [
      {
        urlPattern: '\/aweme\/v1\/web\/aweme\/post\/',
        parseList: json => json?.aweme_list,
        parseItem: data => parseDouyinItem(data)
      },
      {
        urlPattern: '\/aweme\/v1\/web\/general\/search\/single\/',
        parseList: json => json?.data,
        parseItem: data => data?.aweme_info ? parseDouyinItem(data.aweme_info) : null
      },
      {
        urlPattern: '\/aweme\/v1\/web\/aweme\/detail\/',
        parseList: json => [json?.aweme_detail].filter(Boolean),
        parseItem: data => parseDouyinItem(data)
      }
    ]
  },

  'www.xiaohongshu.com': {
    name: '小红书',
    id: 'xhs',
    needSecondRequest: true,
    rules: [
      {
        parseList: json => {
          // API响应格式
          if (json?.data?.items) {
            return json.data.items;
          }
          // 从页面初始数据中提取
          if (json?.__INITIAL_STATE__?.user?.notes?._rawValue) {
            return flattenArray(json.__INITIAL_STATE__.user.notes._rawValue);
          }
          if (json?.__INITIAL_STATE__?.search?.feeds?._rawValue) {
            return flattenArray(json.__INITIAL_STATE__.search.feeds._rawValue);
          }
          if (json?.__INITIAL_STATE__?.feed?.feeds?._rawValue) {
            return flattenArray(json.__INITIAL_STATE__.feed.feeds._rawValue);
          }
          // 直接的数组格式
          if (Array.isArray(json)) {
            return json;
          }
          return [];
        },
        parseItem: data => parseXhsItem(data)
      }
    ]
  },

  'www.kuaishou.com': {
    name: '快手',
    id: 'kuaishou',
    rules: [
      {
        urlPattern: '\/graphql',
        parseList: json => {
          const feeds = json?.data?.visionProfilePhotoList?.feeds ||
                       json?.data?.visionProfileLikePhotoList?.feeds ||
                       json?.data?.visionSearchPhoto?.feeds;
          return feeds || [];
        },
        parseItem: data => parseKuaishouItem(data)
      }
    ]
  },

  'www.tiktok.com': {
    name: 'TikTok',
    id: 'tiktok',
    rules: [
      {
        urlPattern: '\/api\/post\/item_list\/',
        parseList: json => json?.itemList,
        parseItem: data => parseTiktokItem(data)
      },
      {
        urlPattern: '\/api\/search\/general\/full\/',
        parseList: json => json?.data,
        parseItem: data => data?.item ? parseTiktokItem(data.item) : null
      }
    ]
  },

  'www.instagram.com': {
    name: 'Instagram',
    id: 'instagram',
    rules: [
      {
        urlPattern: '\/graphql\/query',
        parseList: json => json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection?.edges,
        parseItem: data => parseInstagramItem(data)
      }
    ]
  }
};

/**
 * 解析函数
 */
function parseDouyinItem(data) {
  if (!data) return null;
  
  const { video, desc, images, aweme_id, awemeId, create_time, createTime, author, authorInfo } = data;
  const id = aweme_id || awemeId;
  const time = create_time || createTime;
  const authorData = author || authorInfo;
  
  if (!id) return null;
  
  const result = {
    id,
    url: `https://www.douyin.com/video/${id}`,
    title: desc || '无标题',
    author: authorData?.nickname,
    cover: video?.cover?.url_list?.[0] || video?.coverUrlList?.[0],
    createTime: time ? time * 1000 : Date.now()
  };

  // 处理图片或视频
  if (images && images.length > 0) {
    result.urls = images.map(img => ({
      url: (img.download_url_list || img.downloadUrlList)?.[0],
      type: 'photo'
    }));
    result.type = 'photo';
  } else if (video) {
    result.urls = video.play_addr?.url_list?.[0];
    result.type = 'video';
  }

  return result;
}

function parseXhsItem(data) {
  if (!data) return null;
  
  // 处理不同的数据结构
  let noteData = data;
  if (data.noteCard) {
    noteData = data.noteCard;
  } else if (data.note_card) {
    noteData = data.note_card;
  } else if (data.note) {
    noteData = data.note;
  }
  
  // 提取字段
  const id = noteData.noteId || noteData.note_id || noteData.id || data.id;
  const title = noteData.displayTitle || noteData.display_title || noteData.title || noteData.desc || '无标题';
  const cover = noteData.cover?.urlDefault || noteData.cover?.url_default || 
                noteData.cover?.url || noteData.imageList?.[0]?.urlDefault;
  const user = noteData.user || data.user;
  const type = noteData.type || data.type || 'unknown';
  
  if (!id) return null;
  
  return {
    id,
    url: `https://www.xiaohongshu.com/explore/${id}`,
    title: title.replace(/🥹/g, ''),
    author: user?.nickname || user?.nick_name,
    cover,
    type
  };
}

function parseKuaishouItem(data) {
  if (!data?.photo) return null;
  
  const { photo, author } = data;
  
  return {
    id: photo.id,
    url: `https://www.kuaishou.com/short-video/${photo.id}`,
    title: photo.caption || photo.originCaption || '无标题',
    author: author?.name,
    cover: photo.coverUrl,
    createTime: photo.timestamp,
    urls: photo.photoUrl,
    type: 'video'
  };
}

function parseTiktokItem(data) {
  if (!data) return null;
  
  const { video, desc, author, id, createTime } = data;
  
  if (!id) return null;
  
  return {
    id,
    url: `https://www.tiktok.com/@${author?.uniqueId}/video/${id}`,
    title: desc || '无标题',
    author: author?.nickname,
    cover: video?.originCover,
    createTime: createTime ? createTime * 1000 : Date.now(),
    urls: video?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0] || video?.downloadAddr,
    type: 'video'
  };
}

function parseInstagramItem(data) {
  if (!data?.node) return null;
  
  const { node } = data;
  const { code, owner, product_type, image_versions2, video_versions, caption } = node;
  
  if (product_type !== 'clips') return null;
  
  return {
    id: code,
    url: `https://www.instagram.com/reel/${code}/`,
    title: caption?.text || '无标题',
    author: owner?.username,
    cover: image_versions2?.candidates?.[0]?.url,
    createTime: caption?.created_at ? caption.created_at * 1000 : Date.now(),
    urls: video_versions?.[0]?.url,
    type: 'video'
  };
}

/**
 * 工具函数
 */
function flattenArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.reduce((result, item) => {
    return result.concat(Array.isArray(item) ? flattenArray(item) : item);
  }, []);
}

function cutString(text, start, end) {
  const beginIndex = text.indexOf(start);
  if (beginIndex === -1) return '';
  
  const startPos = beginIndex + start.length;
  const endIndex = text.indexOf(end, startPos);
  if (endIndex === -1) return '';
  
  return text.substring(startPos, endIndex);
}

/**
 * 获取小红书真实视频链接
 */
async function getXhsVideoURL(item) {
  try {
    const response = await fetch(item.url);
    const text = await response.text();
    const jsonStr = cutString(text, '"noteDetailMap":', ',"serverRequestInfo":');
    
    if (!jsonStr) return null;
    
    const json = JSON.parse(jsonStr);
    const note = json[item.id]?.note;
    
    if (!note) return null;
    
    if (note.type === 'video') {
      return {
        url: note.video?.media?.stream?.h265?.[0]?.masterUrl || 
             note.video?.media?.stream?.h264?.[0]?.masterUrl,
        type: 'video'
      };
    } else {
      return note.imageList?.map(img => ({
        url: img.urlDefault || img.url,
        type: 'photo'
      }));
    }
  } catch (e) {
    console.error('[VideoAnalyzer] 获取小红书视频链接失败:', e);
    return null;
  }
}

/**
 * 消息处理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'DOWNLOAD_FILE':
      // 处理下载请求
      const { url, filename } = request;
      
      // 清理文件名，确保安全
      const safeFilename = filename
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')  // 替换非法字符
        .replace(/^\.+/, '')                      // 移除开头的点
        .replace(/\.+$/, '')                      // 移除结尾的点
        .trim();
      
      if (!safeFilename || safeFilename.length === 0) {
        sendResponse({ 
          success: false, 
          error: '无效的文件名' 
        });
        return;
      }
      
      console.log('[VideoAnalyzer] 开始下载:', { url, filename: safeFilename });
      
      try {
        // 使用Chrome下载API
        chrome.downloads.download({
          url: url,
          filename: safeFilename,
          saveAs: false,
          conflictAction: 'uniquify'
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('[VideoAnalyzer] 下载失败:', chrome.runtime.lastError);
            sendResponse({ 
              success: false, 
              error: chrome.runtime.lastError.message 
            });
          } else {
            console.log('[VideoAnalyzer] 下载成功，ID:', downloadId);
            sendResponse({ 
              success: true, 
              downloadId: downloadId 
            });
          }
        });
      } catch (error) {
        console.error('[VideoAnalyzer] 下载异常:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
      
      // 返回true表示异步响应
      return true;
      
    case 'GET_PLATFORM_CONFIG':
      const config = PLATFORMS[request.hostname];
      sendResponse(config || null);
      break;
      
    case 'ANALYZE_DATA':
      try {
        const platformId = request.platform === 'xhs' ? 'www.xiaohongshu.com' : 
                          request.platform === 'douyin' ? 'www.douyin.com' :
                          request.platform === 'kuaishou' ? 'www.kuaishou.com' :
                          request.platform === 'tiktok' ? 'www.tiktok.com' :
                          request.platform === 'instagram' ? 'www.instagram.com' : null;
        
        const platform = platformId ? PLATFORMS[platformId] : null;
        if (!platform) {
          sendResponse([]);
          break;
        }
        
        // 找到匹配的规则
        const rule = platform.rules.find(r => {
          if (!r.urlPattern) return true;
          return new RegExp(r.urlPattern).test(request.url);
        });
        
        if (!rule) {
          sendResponse([]);
          break;
        }
        
        // 解析数据
        const list = rule.parseList(request.data) || [];
        const results = [];
        
        for (const item of list) {
          const parsed = rule.parseItem(item);
          if (parsed) {
            results.push(parsed);
          }
        }
        
        sendResponse(results);
      } catch (e) {
        console.error('[VideoAnalyzer] 解析数据失败:', e);
        sendResponse([]);
      }
      break;
      
    case 'GET_VIDEO_URL':
      if (request.platform === 'xhs') {
        getXhsVideoURL(request.item).then(sendResponse);
        return true; // 异步响应
      } else {
        sendResponse(null);
      }
      break;
      
    default:
      sendResponse(null);
  }
});

console.log('[VideoAnalyzer] 后台服务已启动');