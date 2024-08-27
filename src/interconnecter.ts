import { interconnect, prompt } from "./tsimports";

export let CONNECTION_OPEN = false;

// 生成唯一ID的工具函数
function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (error: any) => void;
}

// 用于存储未完成请求的映射表
const pendingRequests: { [id: string]: PendingRequest } = {};

// 获取连接对象
const conn = interconnect.instance();

// 设置连接打开的回调
conn.onopen = () => {
  console.log(`connection opened`);
  setTimeout(async() => {
    await sendMessage(JSON.stringify({
      msgtype: "HELLO",
      message: ""
    }))
  }, 500)
  CONNECTION_OPEN = true;
};

// 设置连接关闭的回调
conn.onclose = (data) => {
  console.log(`connection closed, reason = ${data.data}, code = ${data.code}`);
};

// 设置连接错误的回调
conn.onerror = (data) => {
  console.log(`connection error, errMsg = ${data.data}, errCode = ${data.code}`);
};

// 处理收到消息的回调
conn.onmessage = (data) => {
  const { id, response } = JSON.parse(data.data);

  if (id && pendingRequests[id]) {
    // 如果ID存在且匹配，则认为是对号入座的响应
    pendingRequests[id].resolve(response);
    // 完成请求后，删除对应的映射
    delete pendingRequests[id];
  } else {
    console.log(`Received unrecognized message: ${data.data}`);
  }
};

// 异步发送字符串并等待回应的函数
export async function sendMessage(message: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = generateUniqueId();

    // 将请求添加到待处理请求映射表中
    pendingRequests[id] = { resolve, reject };

    // 发送数据
    conn.send({
      data: {
        id,
        message,
      },
      success: () => {
        console.log('Message sent successfully');
      },
      fail: (data: { data: any, code: number }) => {
        prompt.showToast({
            message: "interconnect通信失败：" + data.data + " 错误代码：" + data.code,
            duration: 5000
        })
        console.log(`handling fail, errMsg = ${data.data}, errCode = ${data.code}`);
        // 如果发送失败，则执行 reject
        reject(new Error(`Failed to send message, errCode = ${data.code}`));
        // 失败后，删除对应的映射
        delete pendingRequests[id];
      },
    });
  });
}