import { fetch, storage, crypto, prompt } from './tsimports';
import * as eula from './eula'

// Wbi签名混淆表
const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
];

// 对imgKey和subKey进行混淆编码
const getMixinKey = (orig: string) =>
    mixinKeyEncTab.map(n => orig[n]).join("").slice(0, 32);

// 账号数据接口
interface AccountData {
    sessData: string;
    biliJct: string;
    dedeUserID: string;
    sid: string;
}

class BilibiliClient {
    // 版本号
    public version: string = "2.4";

    // Fetch API
    // 会根据是否启用interconnect模式做出改变
    // 具体请看constructor
    public fetch: any;

    // Interconnect 再封装 Message API
    public interconnecter: any;
    // 是否启用interconnect联网方式
    private interconnect_mode: boolean;

    // 扫码登录用的二维码Key
    private qrCodeKey: string | null = null;

    // B站Cookies
    private sessData: string | null = null;
    private biliJct: string | null = null;
    private dedeUserID: string | null = null;
    private sid: string | null = null;

    // B站账号信息（非AccountData）
    private accountInfo: any | null = null;

    // 风控Cookies（不存储，构建biliclient时更新）
    private buvid3: string | null = null;
    private buvid4: string | null = null;

    // 私信DeviceId，每次登录刷新
    // From https://github.com/andywang425/BLTH/
    private dm_deviceid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (function (name) {
        let randomInt = 16 * Math.random() | 0;
        return ("x" === name ? randomInt : 3 & randomInt | 8).toString(16).toUpperCase()
    }));

    constructor() {
        this.updateBUVID();
        this.fetch = fetch;
    }

    // 获取请求头，用于模拟正常浏览器环境，降低风控概率
    getHeaders(): Record<string, string> {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/jxl,image/webp,image/png,image/svg+xml,*/*;q=0.8',
            'Accept-Encoding': '',
            'Accept-Language': 'zh-CN,zh;q=0.8',
            'Cookie': this.getCookieString(),
            'Referer': 'https://www.bilibili.com',
            'Origin': 'https://www.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0'
        };
    }

    // 构建Cookie字符串
    private getCookieString(): string {
        var cookies = `buvid3=${this.buvid3}; buvid4=${this.buvid4}; `;
        if (this.sessData) {
            cookies += `SESSDATA=${this.sessData}; bili_jct=${this.biliJct}; DedeUserID=${this.dedeUserID}; sid=${this.sid}; `
        }
        return cookies;
    }

    // Wbi签名
    private encWbi(params: Record<string, any>, img_key: string, sub_key: string): string {
        const mixin_key = getMixinKey(img_key + sub_key);
        const curr_time = Math.floor(Date.now() / 1000);

        params.wts = curr_time; // 添加时间戳字段
        const query = Object.keys(params)
            .sort()
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key].toString().replace(/[!'()*]/g, ""))}`)
            .join("&");

        const wbi_sign = crypto.hashDigest({ data: query + mixin_key, algo: "MD5" });
        console.log("wbi_sign: " + wbi_sign);

        return `${query}&w_rid=${wbi_sign}`;
    }

    // 发送GET请求
    private async getRequest(url: string, responseType: string = "json"): Promise<any> {
        console.log("getRequest: " + url);
        try {
            const response = await this.fetch.fetch({
                url,
                responseType: responseType,
                header: this.getHeaders()
            });
            return response.data;
        } catch (error) {
            console.error(`GET请求失败，错误码 = ${error.code}`);
            throw error;
        }
    }

    // 发送带Wbi签名的GET请求
    private async getRequestWbi(url: string, params: any): Promise<any> {
        const img_key = this.accountInfo.wbi_img.img_url.split('/').pop().split('.')[0];
        const sub_key = this.accountInfo.wbi_img.sub_url.split('/').pop().split('.')[0];
        const signedParams = this.encWbi(params, img_key, sub_key);
        return this.getRequest(`${url}?${signedParams}`);
    }

    // 发送POST请求
    private async postRequest(url: string, data: string, content_type: string, custom_headers: any = null): Promise<any> {
        console.log(`postRequest: ${url}, body: ${data}, contentType: ${content_type}`);
        let headers = { ...this.getHeaders(), "Content-Type": content_type }
        if (custom_headers) {
            headers = custom_headers
        }
        try {
            const response = await this.fetch.fetch({
                url,
                responseType: 'json',
                method: 'POST',
                data,
                header: headers
            });
            return response.data;
        } catch (error) {
            console.error(`POST请求失败，错误码 = ${error.code}`);
            throw error;
        }
    }

    // 发送带Wbi签名的POST请求
    private async postRequestWbi(url: string, wbiParams: any, data: string, content_type: string, custom_headers: any = null): Promise<any> {
        const img_key = this.accountInfo.wbi_img.img_url.split('/').pop().split('.')[0];
        const sub_key = this.accountInfo.wbi_img.sub_url.split('/').pop().split('.')[0];
        const signedParams = this.encWbi(wbiParams, img_key, sub_key);
        return this.postRequest(`${url}?${signedParams}`, data, content_type, custom_headers);
    }

    //-- 检查澎湃哔哩是否存在更新
    // async checkHyperbilibiliUpdates(): Promise<any> {
    //     const latestVerGet = await this.fetch.fetch({
    //         url: "https://gitee.com/search__stars/hb_ota_info/raw/master/current_ver",
    //         header: this.getHeaders()
    //     });
    //     console.log(latestVerGet.data);
    //     const latestVer = latestVerGet.data.data;
    //     if (latestVer != this.version) {
    //         return {
    //             update: true,
    //             msg: `检查到更新v${latestVer}，请前往hyperbili.astralsight.space下载更新`
    //         };
    //     }
    //     return { update: false, msg: "" };
    // }

    getEulaShowContent(): any {
        // 使用硬编码的EULA文本
        // 因为部分地区可能无法访问境外加速CDN
        const response = {
            data: eula.eula
        };

        return response.data;
    }

    // 获取二维码信息
    async loginQR(): Promise<{ url: string, qrcode_key: string }> {
        console.log("请求登录二维码");
        const response = await this.getRequest('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
        if (response && response.data) {
            this.qrCodeKey = response.data.data.qrcode_key;
            if (this.interconnect_mode) {
                await this.interconnecter.sendMessage(JSON.stringify({
                    msgtype: "SHOWQR",
                    message: response.data.data.url
                }))
            }
            return { url: response.data.data.url, qrcode_key: response.data.data.qrcode_key };
        } else {
            throw new Error('获取二维码失败');
        }
    }

    // 更新账号信息
    async updateAccountInfo(): Promise<boolean> {
        const accountInfoResponse = await this.getRequest("https://api.bilibili.com/x/web-interface/nav");
        this.accountInfo = accountInfoResponse.data.data;
        return !!this.accountInfo;
    }

    // 刷新BUVID
    async updateBUVID() {
        const response = await this.getRequest("https://api.bilibili.com/x/frontend/finger/spi");
        this.buvid3 = response.data.data.b_3;
        this.buvid4 = response.data.data.b_4;
    }

    // 登录函数，使用本地存储的账号数据或通过二维码登录
    async login(send_req: boolean, interval: NodeJS.Timeout | null = null): Promise<{ success: boolean, message: string }> {
        const accountData = await this.getStoredAccountData();
        if (accountData) {
            this.sessData = accountData.sessData;
            this.biliJct = accountData.biliJct;
            this.dedeUserID = accountData.dedeUserID;
            this.sid = accountData.sid;
            console.log('使用存储的账号数据登录成功');
            await this.updateAccountInfo();
            await this.updateBUVID();
            return { success: true, message: "登录成功" };
        } else if (send_req) {
            const response = await this.getRequest(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${this.qrCodeKey}`);
            if (response && response.data && response.data.data.code === 0) {
                if (interval) clearInterval(interval);

                this.extractCookiesFromResponse(response.headers['Set-Cookie']);
                await this.storeAccountData();
                console.log('使用二维码登录并存储账号数据成功');
                await this.updateAccountInfo();
                await this.updateBUVID();
                return { success: true, message: "登录成功" };
            } else {
                return { success: false, message: "等待用户操作..." };
            }
        }
    }

    // 从响应头中提取Cookies
    private extractCookiesFromResponse(setCookieHeaders: string | string[]) {
        if (typeof setCookieHeaders === 'string') {
            setCookieHeaders = setCookieHeaders.split(', ');
        }

        setCookieHeaders.forEach(cookie => {
            if (cookie.includes('SESSDATA')) this.sessData = this.parseCookie(cookie, 'SESSDATA');
            else if (cookie.includes('bili_jct')) this.biliJct = this.parseCookie(cookie, 'bili_jct');
            else if (cookie.includes('DedeUserID') && !cookie.includes('DedeUserID__ckMd5')) this.dedeUserID = this.parseCookie(cookie, 'DedeUserID');
            else if (cookie.includes('sid')) this.sid = this.parseCookie(cookie, 'sid');
        });
    }

    // 获取首页视频推荐
    async getMainPageRecommendVideos(fresh_type: number, pagesize: number): Promise<any> {
        const url = `https://api.bilibili.com/x/web-interface/index/top/rcmd?fresh_type=${fresh_type}&ps=${pagesize}&version=1`;
        const response = await this.getRequest(url);
        return response.data.data.item;
    }

    // 根据视频BV号获取视频详情信息
    async getVideoInfoByBVID(bvid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 获取用户创建的所有收藏夹信息
    async getUserFavouriteFolders(mid: string, type: number = 0, rid: string = null): Promise<any> {
        let url = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}&type=${type}`;
        if (rid) url += `&rid=${rid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 获取目标收藏夹元数据
    async getFavouriteFolderMetadata(mlid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/info?media_id=${mlid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 获取目标收藏夹内容
    async getFavouriteFolderContent(mlid: string, pn: number, ps: number = 10, keyword: string = null): Promise<any> {
        let url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mlid}&ps=${ps}&pn=${pn}`;
        if (keyword) url += `&keyword=${keyword}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 判断视频是否被点赞
    async isVideoLikedByBVID(bvid: string): Promise<boolean> {
        const url = `https://api.bilibili.com/x/web-interface/archive/has/like?bvid=${bvid}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 判断视频是否被投币
    async isVideoCoinedByBVID(bvid: string): Promise<boolean> {
        const url = `https://api.bilibili.com/x/web-interface/archive/coins?bvid=${bvid}`;
        const response = await this.getRequest(url);
        return response.data.data.multiply;
    }

    // 判断视频是否被收藏
    async isVideoStaredByBVID(bvid: string): Promise<boolean> {
        const url = `https://api.bilibili.com/x/v2/fav/video/favoured?aid=${bvid}`;
        const response = await this.getRequest(url);
        return response.data.data.favoured;
    }

    // 获取评论区内容
    async getReplies(type: string, oid: string, pn: number = 1, ps: number = 10, sort: number = 1) {
        const url = `https://api.bilibili.com/x/v2/reply?type=${type}&oid=${oid}&pn=${pn}&ps=${ps}&sort=${sort}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 获取二级评论区内容
    async getSecReplies(type: string, oid: string, root: string, pn: number = 1, ps: number = 10) {
        const url = `https://api.bilibili.com/x/v2/reply/reply?type=${type}&oid=${oid}&pn=${pn}&ps=${ps}&root=${root}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 点赞评论
    async LikeReply(type: string, oid: string, rpid: string, action: number) {
        const url = "https://api.bilibili.com/x/v2/reply/action";
        const body = `type=${type}&oid=${oid}&rpid=${rpid}&action=${action}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }

    // 发送评论
    async GiveReply(type: string, oid: string, message: string) {
        const url = "https://api.bilibili.com/x/v2/reply/add";
        const body = `type=${type}&oid=${oid}&message=${message}&plat=1&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }

    // 回复评论（发送二级评论）
    async GiveSecReply(type: string, oid: string, parent: string, message: string) {
        const url = "https://api.bilibili.com/x/v2/reply/add";
        const body = `type=${type}&oid=${oid}&parent=${parent}&message=${message}&plat=1&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }

    // 回复二级评论（对话树）
    async GiveTreeReply(type: string, oid: string, parent: string, root: string, message: string) {
        const url = "https://api.bilibili.com/x/v2/reply/add";
        const body = `type=${type}&oid=${oid}&parent=${parent}&root=${root}&message=${message}&plat=1&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }

    // 获取视频AI摘要
    async getVideoAISummaryByBVID(bvid: string, cid: string, up_mid: string) {
        const url = "https://api.bilibili.com/x/web-interface/view/conclusion/get";
        const response = await this.getRequestWbi(url, { bvid, cid, up_mid });
        return response.data.data.model_result.summary;
    }

    // 收藏视频至默认收藏夹
    async starVideoToDefaultFavFolderByBVID(bvid: string): Promise<any> {
        let defaultFolderID = 0;
        const folders = await this.getUserFavouriteFolders(this.accountInfo.mid);
        folders.list.forEach(folder => {
            if (folder.title === "默认收藏夹") {
                defaultFolderID = folder.id;
            }
        });
        if (!defaultFolderID) return false;

        try {
            const videoInfo = await this.getVideoInfoByBVID(bvid);
            const aid = videoInfo.aid;
            const url = `https://api.bilibili.com/x/v3/fav/resource/deal`;
            const data = `rid=${aid}&csrf=${this.biliJct}&type=2&add_media_ids=${defaultFolderID}&del_media_ids=`;
            const response = await this.postRequest(url, data, "application/x-www-form-urlencoded");
            return response.data.code;
        } catch (error) {
            console.error("Error starring video: ", error);
            return false;
        }
    }

    // 获取搜索热词
    async getSearchHotwords(): Promise<any> {
        const url = "https://s.search.bilibili.com/main/hotword";
        const response = await this.getRequest(url);
        return response.data.list;
    }

    // 获取历史记录
    async getWatchHistory(pn: number, ps: number): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history?pn=${pn}&ps=${ps}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 点赞视频
    async LikeVideo(bvid: string, like: number): Promise<any> {
        const url = "https://api.bilibili.com/x/web-interface/archive/like";
        const body = `bvid=${bvid}&like=${like}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }

    // 投币视频
    async CoinVideo(bvid: string, multiply: number): Promise<any> {
        const url = "https://api.bilibili.com/x/web-interface/coin/add";
        const body = `bvid=${bvid}&multiply=${multiply}&csrf=${this.biliJct}`;
        const response = await this.postRequest(url, body, "application/x-www-form-urlencoded");
        return response.data;
    }

    // 全站搜索（首页入口）（视频、用户）
    async searchContents(keyword: string, vidcount: number = 20): Promise<any> {
        const url = "https://api.bilibili.com/x/web-interface/wbi/search/all/v2";
        const response = await this.getRequestWbi(url, { keyword });

        let result = { users: [], videos: [], comprehensive_videos: [] };

        response.data.data.result.forEach(result_array => {
            switch (result_array.result_type) {
                case "bili_user":
                    result.users = result_array.data;
                    break;
                case "video":
                    result_array.data.forEach(vid => {
                        if (vid.bvid) {
                            result.videos.push(vid)
                        }
                    });
                    break;
            }
        });

        result.comprehensive_videos = result.videos.slice(0, 5);
        result.videos = result.videos.slice(0, vidcount)

        return result;
    }

    // 全站搜索，但是按类型细分
    /* SearchType可取：
        视频：video
        番剧：media_bangumi
        影视：media_ft
        直播间及主播：live
        直播间：live_room
        主播：live_user
        专栏：article
        话题：topic
        用户：bili_user
        相簿：photo
    */
    async searchContentWithType(keyword: string, search_type: string) {
        console.log("[searchContentWithType] keyword=" + keyword + " type=" + search_type)
        const url = "https://api.bilibili.com/x/web-interface/wbi/search/type"
        const response = await this.getRequestWbi(url, {
            keyword,
            search_type
        })

        return response.data.data;
    }

    // 获取通知信息数量 （例如回复我的、at我的、点赞数量）
    async getMessageNotifyFeed() {
        const url = "https://api.vc.bilibili.com/x/im/web/msgfeed/unread";
        const response = await this.getRequest(url);
        return response.data.data;
    }

    // 获取私信Session列表
    // 一次性最多拉取20个，可加end_ts做IFS（但没必要）
    async getDMSessions(session_type: number, sort_rule: number) {
        const url = "https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions"
        const response = await this.getRequestWbi(url, {
            session_type,
            sort_rule,
            group_fold: 0,
            unfollow_fold: 0,
            mobi_app: "web"
        })

        return response.data.data
    }

    // 获取私信Session聊天记录
    // 若要做IFS，则end_seqno应该为最顶上那条信息的序列号
    // 接口有漏洞，自带防撤回
    async getDMSessionMessage(session_type: number, talker_id: string, size: number = 10, end_seqno: string) {
        const url = "https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs"
        var params = {
            session_type,
            talker_id,
            size
        };
        if (end_seqno) {
            params["end_seqno"] = end_seqno;
        }
        const response = await this.getRequestWbi(url, params);

        return response.data.data
    }

    // 发送私信消息
    async SendDMSessionMessage(receiver_id: string, msg_type: number, content: string) {
        const url = "https://api.vc.bilibili.com/web_im/v1/web_im/send_msg";
        const body = `msg[sender_uid]=${this.accountInfo.mid}&msg[receiver_id]=${receiver_id}&msg[receiver_type]=1&msg[msg_type]=${msg_type}&msg[dev_id]=${this.dm_deviceid}&msg[timestamp]=${Number.parseInt(((new Date()).getTime() / 1000).toString())}&msg[content]=${encodeURIComponent(`{"content": "${content}"}`)}&csrf=${this.biliJct}&csrf_token=${this.biliJct}&msg[msg_status]=0&msg[new_face_version]=0&from_firework=0&build=0&mobi_app=web`;

        var headers = { ...this.getHeaders(), "Content-Type": "application/x-www-form-urlencoded" }
        headers["Host"] = "api.vc.bilibili.com"
        headers["Origin"] = "https://message.bilibili.com"
        headers["Referer"] = "https://message.bilibili.com/"
        headers["Content-Length"] = body.length

        const response = await this.postRequestWbi(url, {
            w_sender_uid: this.accountInfo.mid,
            w_receiver_id: receiver_id,
            w_dev_id: this.dm_deviceid
        }, body, "application/x-www-form-urlencoded", headers);

        return response.data
    }

    // 根据UID批量获取用户信息
    async getMultiUserInfoByUID(uids: Array<String>) {
        const url = "https://api.bilibili.com/x/polymer/pc-electron/v1/user/cards";
        let param = "";
        uids.forEach(uid => {
            param += uid
            if (uids.indexOf(uid) != uids.length - 1) {
                param += ","
            }
        });
        const response = await this.getRequest(`${url}?uids=${param}`)

        return response.data.data
    }

    // 根据BVID与CID获取视频MP4流地址
    // qn: 32=480p 64=720p
    async getVideoMP4StreamByBVID(cid: string, bvid: string, qn: string = "32") {
        const url = `https://api.bilibili.com/x/player/wbi/playurl`
        const response = await this.getRequestWbi(url, {
            cid,
            bvid,
            qn,
            fnval: "1",
            platform: "html5"
        })

        console.log(response)
        return response.data.data
    }

    // 获取专栏网页HTML（需要过parser才能使用）
    async getArticle(cvid: string): Promise<any> {
        const url = `https://www.bilibili.com/read/${cvid}`;
        const response = await this.getRequest(url, "text");

        return response.data;
    }

    // 退出登录（删除本地存储的账号数据）
    logOut() {
        storage.delete({ key: "bilibili_account" });
    }

    // 辅助函数，用于解析cookie字符串
    private parseCookie(cookie: string, name: string): string | null {
        const match = cookie.match(new RegExp(`${name}=([^;]+)`));
        return match ? match[1] : null;
    }

    // 获取本地存储的账号数据
    private async getStoredAccountData(): Promise<AccountData | null> {
        return new Promise((resolve) => {
            storage.get({
                key: 'bilibili_account',
                success: (data: string) => {
                    resolve(data ? JSON.parse(data) as AccountData : null);
                },
                fail: (data: any, code: number) => {
                    console.log(`获取存储的账号数据失败，错误码 = ${code}`);
                    resolve(null);
                }
            });
        });
    }

    // 保存账号数据到本地存储
    private async storeAccountData(): Promise<void> {
        if (this.sessData && this.biliJct && this.dedeUserID && this.sid) {
            const accountData: AccountData = { sessData: this.sessData, biliJct: this.biliJct, dedeUserID: this.dedeUserID, sid: this.sid };
            return new Promise((resolve, reject) => {
                storage.set({
                    key: 'bilibili_account',
                    value: JSON.stringify(accountData),
                    success: () => {
                        console.log('账号数据存储成功');
                        resolve();
                    },
                    fail: (data: any, code: number) => {
                        console.log(`存储账号数据失败，错误码 = ${code}`);
                        reject();
                    }
                });
            });
        }
    }
}

export { BilibiliClient };