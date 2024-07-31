import { fetch, storage, crypto } from './tsimports';

const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

// 对 imgKey 和 subKey 进行字符顺序打乱编码
// From: https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md
const getMixinKey = (orig: string) =>
    mixinKeyEncTab
        .map((n) => orig[n])
        .join("")
        .slice(0, 32);

interface AccountData {
    sessData: string;
    biliJct: string;
    dedeUserID: string;
    sid: string;
}

class BilibiliClient {
    public version: string = "2.0"

    private qrCodeKey: string | null = null;
    private sessData: string | null = null;
    private biliJct: string | null = null;
    private dedeUserID: string | null = null;
    private sid: string | null = null;
    private accountInfo: any | null = null;
    private buvid3: any | null = null;
    private buvid4: any | null = null;

    // 获取请求头
    private getHeaders(): { [key: string]: string } {
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
        return `SESSDATA=${this.sessData}; bili_jct=${this.biliJct}; DedeUserID=${this.dedeUserID}; sid=${this.sid}; buvid3=${this.buvid3}; buvid4=${this.buvid4}`;
    }

    // 对params进行wbi签名
    // From: https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md
    private encWbi(params: any, img_key: string, sub_key: string) {
        const mixin_key = getMixinKey(img_key + sub_key),
            curr_time = Math.round(Date.now() / 1000),
            chr_filter = /[!'()*]/g;

        Object.assign(params, { wts: curr_time }); // 添加 wts 字段
        // 按照 key 重排参数
        const query = Object.keys(params)
            .sort()
            .map((key) => {
                // 过滤 value 中的 "!'()*" 字符
                const value = params[key].toString().replace(chr_filter, "");
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            })
            .join("&");

        const wbi_sign = crypto.hashDigest({
            data: query + mixin_key,
            algo: "MD5"
        })
        console.log("wbi_sign: " + wbi_sign)

        return query + "&w_rid=" + wbi_sign;
    }

    // 发送GET请求的函数
    private async getRequest(url: string): Promise<any> {
        console.log("getRequest: " + url)
        try {
            const response = await fetch.fetch({
                url: url,
                responseType: 'json',
                header: this.getHeaders()
            });
            return response.data;
        } catch (error) {
            console.error(`GET请求失败，错误码 = ${error.code}`);
            throw error;
        }
    }

    private async getRequestWbi(url: string, params: any): Promise<any> {
        return (await this.getRequest(`${url}?${this.encWbi(params, this.accountInfo.wbi_img.img_url.slice(this.accountInfo.wbi_img.img_url.lastIndexOf('/') + 1, this.accountInfo.wbi_img.img_url.lastIndexOf('.')), this.accountInfo.wbi_img.sub_url.slice(this.accountInfo.wbi_img.sub_url.lastIndexOf('/') + 1, this.accountInfo.wbi_img.sub_url.lastIndexOf('.')))}`))
    }

    // 发送POST请求的函数
    private async postRequest(url: string, data: string, content_type: string): Promise<any> {
        var headers = this.getHeaders();
        headers["Content-Type"] = content_type

        try {
            const response = await fetch.fetch({
                url: url,
                responseType: 'json',
                method: 'POST',
                data: data,
                header: headers
            });
            return response.data;
        } catch (error) {
            console.error(`POST请求失败，错误码 = ${error.code}`);
            throw error;
        }
    }

    async checkHyperbilibiliUpdates(): Promise<any>{
        const latestVerGet = await fetch.fetch({
            url: "https://gitee.com/search__stars/hb_ota_info/raw/master/current_ver",
            header: this.getHeaders()
        });
        console.log(latestVerGet.data)
        const latestVer = latestVerGet.data.data;
        if(latestVer != this.version){
            return {
                update: true,
                msg: "检查到更新v" + latestVer + "，请前往bandbbs.cn下载更新"
            }
        }
        return {
            update: false,
            msg: ""
        }
    }

    // 获取二维码信息
    async login_qr(): Promise<{ url: string, qrcode_key: string }> {
        console.log("请求登录二维码");
        const url = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
        const response = await this.getRequest(url);

        if (response && response.data) {
            this.qrCodeKey = response.data.data.qrcode_key;
            return {
                url: response.data.data.url,
                qrcode_key: response.data.data.qrcode_key
            };
        } else {
            throw new Error('获取二维码失败');
        }
    }

    // 更新账号信息
    async updateAccountInfo(): Promise<boolean> {
        const accoutInfo = await this.getRequest("https://api.bilibili.com/x/web-interface/nav");
        this.accountInfo = accoutInfo.data.data;
        if (this.accountInfo) {
            return true;
        }
        return false;
    }

    // 刷新BUVID
    async updateBUVID() {
        const url = "https://api.bilibili.com/x/frontend/finger/spi";
        const response = await this.getRequest(url);

        this.buvid3 = response.data.data.b_3
        this.buvid4 = response.data.data.b_4
    }

    // 登录函数，使用本地存储的账号数据或通过二维码登录
    async login(send_req: boolean, interval: NodeJS.Timeout | null = null): Promise<{ success: boolean, message: string }> {
        const accountData = await this.getStoredAccountData();
        if (accountData) {
            console.log("Loaded AccountData: ", accountData)
            this.sessData = accountData.sessData;
            this.biliJct = accountData.biliJct;
            this.dedeUserID = accountData.dedeUserID;
            this.sid = accountData.sid;
            console.log('使用存储的账号数据登录成功');
            await this.updateAccountInfo()
            await this.updateBUVID()
            return {
                success: true,
                message: "登录成功"
            };
        } else if (send_req) {
            const url = `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${this.qrCodeKey}`;
            const response = await this.getRequest(url);

            if (response && response.data && response.data.data.code === 0) {
                if (interval) {
                    clearInterval(interval);
                }

                let setCookieHeaders = response.headers['Set-Cookie'] || [];

                if (typeof setCookieHeaders === 'string') {
                    setCookieHeaders = setCookieHeaders.split(', ');
                }

                setCookieHeaders.forEach(cookie => {
                    if (cookie.includes('SESSDATA')) {
                        this.sessData = this.parseCookie(cookie, 'SESSDATA');
                    } else if (cookie.includes('bili_jct')) {
                        this.biliJct = this.parseCookie(cookie, 'bili_jct');
                    } else if (cookie.includes('DedeUserID') && !cookie.includes('DedeUserID__ckMd5')) {
                        this.dedeUserID = this.parseCookie(cookie, 'DedeUserID');
                    } else if (cookie.includes('sid')) {
                        this.sid = this.parseCookie(cookie, 'sid');
                    }
                });

                await this.storeAccountData();
                console.log('使用二维码登录并存储账号数据成功');
                await this.updateAccountInfo()
                await this.updateBUVID()
                return {
                    success: true,
                    message: "登录成功"
                };
            } else {
                return {
                    success: false,
                    message: "等待用户操作..."
                };
            }
        }
    }

    // 获取首页视频推荐
    async getMainPageRecommendVideos(fresh_type: number, pagesize: number): Promise<any> {
        const url = `https://api.bilibili.com/x/web-interface/index/top/rcmd?fresh_type=${fresh_type}&ps=${pagesize}&version=1`;
        const response = await this.getRequest(url);

        return response.data.data.item
    }

    // 根据视频BV号获取视频详情信息
    async getVideoInfoByBVID(bvid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const response = await this.getRequest(url);

        return response.data.data
    }

    // 获取目标用户创建的所有收藏夹的基本信息
    async getUserFavouriteFolders(mid: string, type: number = 0, rid: string = null): Promise<any> {
        let url = `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}&type=${type}`;
        if (rid) {
            url += `&rid=${rid}`;
        }
        const response = await this.getRequest(url);

        return response.data.data
    }

    // 获取目标收藏夹元数据
    async getFavouriteFolderMetadata(mlid: string): Promise<any> {
        const url = `https://api.bilibili.com/x/v3/fav/folder/info?media_id=${mlid}`;
        const response = await this.getRequest(url);

        return response.data.data
    }

    // 获取目标收藏夹内容
    async getFavouriteFolderContent(mlid: string, pn: number, ps: number = 10, keyword: string = null): Promise<any> {
        let url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mlid}&ps=${ps}&pn=${pn}`;
        if (keyword) {
            url += `&keyword=${keyword}`
        }
        const response = await this.getRequest(url);

        return response.data.data
    }

    // 使用视频bvid检测视频是否被收藏
    async isVideoStaredByBVID(bvid: string): Promise<boolean> {
        const url = `https://api.bilibili.com/x/v2/fav/video/favoured?aid=${bvid}`
        const response = await this.getRequest(url);

        return response.data.data.favoured
    }

    // 获取评论区内容
    async getReplies(type: string, oid: string, pn: number = 1, ps: number = 10, sort: number = 1) {
        const url = `https://api.bilibili.com/x/v2/reply?type=${type}&oid=${oid}&pn=${pn}&ps=${ps}&sort=${sort}`
        const response = await this.getRequest(url);

        return response.data.data
    }

    // 获取二级评论区内容
    async getSecReplies(type: string, oid: string, root: string, pn: number = 1, ps: number = 10) {
        const url = `https://api.bilibili.com/x/v2/reply/reply?type=${type}&oid=${oid}&pn=${pn}&ps=${ps}&root=${root}`
        const response = await this.getRequest(url);

        return response.data.data
    }

    // 获取视频AI摘要
    async getVideoAISummaryByBVID(bvid: string, cid: string, up_mid: string){
        const url = "https://api.bilibili.com/x/web-interface/view/conclusion/get"
        const response = await this.getRequestWbi(url, {
            bvid: bvid,
            cid: cid,
            up_mid: up_mid
        })

        return response.data.data.model_result.summary
    }

    // 收藏视频至默认收藏夹
    async starVideoToDefaultFavFolderByBVID(bvid: string): Promise<any> {
        let defaultFolderID = 0
        const folders = await this.getUserFavouriteFolders(this.accountInfo.mid)
        folders.list.forEach(folder => {
            if (folder.title == "默认收藏夹") {
                defaultFolderID = folder.id
            }
        });
        if (defaultFolderID == 0) {
            return false
        }
        this.getVideoInfoByBVID(bvid).then(async (videoInfo) => {
            const aid = videoInfo.aid;
            const url = `https://api.bilibili.com/x/v3/fav/resource/deal`
            const data = `rid=${aid}&csrf=${this.biliJct}&type=2&add_media_ids=${defaultFolderID}&del_media_ids=`
            const response = await this.postRequest(url, data, "application/x-www-form-urlencoded");

            return response.data.code
        }).catch(error => {
            console.log("catched error: " + error)
            return false
        });
        return false
    }

    // 退出登录（指在手表上删除存储的账号数据）
    logOut(): any {
        storage.delete({
            key: "bilibili_account",
            success: (data) => {
                return true;
            },
            fail: (data, code) => {
                return false;
            }
        })
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
                success: function (data: string) {
                    if (data && data !== "") {
                        resolve(JSON.parse(data) as AccountData);
                    } else {
                        resolve(null);
                    }
                },
                fail: function (data: any, code: number) {
                    console.log(`获取存储的账号数据失败，错误码 = ${code}`);
                    resolve(null);
                }
            });
        });
    }

    // 保存账号数据到本地存储
    private async storeAccountData(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.sessData && this.biliJct && this.dedeUserID && this.sid) {
                const accountData: AccountData = {
                    sessData: this.sessData,
                    biliJct: this.biliJct,
                    dedeUserID: this.dedeUserID,
                    sid: this.sid
                };
                storage.set({
                    key: 'bilibili_account',
                    value: JSON.stringify(accountData),
                    success: function () {
                        console.log('账号数据存储成功');
                        resolve();
                    },
                    fail: function (data: any, code: number) {
                        console.log(`存储账号数据失败，错误码 = ${code}`);
                        reject();
                    }
                });
            }
        });
    }
}

export { BilibiliClient };