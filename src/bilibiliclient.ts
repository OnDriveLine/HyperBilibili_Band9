import { fetch, storage } from './tsimports';

interface AccountData {
    sessData: string;
    biliJct: string;
    dedeUserID: string;
    sid: string;
}

class BilibiliClient {
    private qrCodeKey: string | null = null;
    private sessData: string | null = null;
    private biliJct: string | null = null;
    private dedeUserID: string | null = null;
    private sid: string | null = null;

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
        return `SESSDATA=${this.sessData}; bili_jct=${this.biliJct}; DedeUserID=${this.dedeUserID}; sid=${this.sid}`;
    }

    // 发送GET请求的函数
    private async getRequest(url: string): Promise<any> {
        try {
            const response = await fetch.fetch({
                url: url,
                responseType: 'json',
                header: this.getHeaders()
            });
            console.log(response.data);
            return response.data;
        } catch (error) {
            console.error(`请求失败，错误码 = ${error.code}`);
            throw error;
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

    // 登录函数，使用本地存储的账号数据或通过二维码登录
    async login(send_req: boolean, interval: NodeJS.Timeout | null = null): Promise<{ success: boolean, message: string }> {
        const accountData = await this.getStoredAccountData();
        if (accountData) {
            this.sessData = accountData.sessData;
            this.biliJct = accountData.biliJct;
            this.dedeUserID = accountData.dedeUserID;
            this.sid = accountData.sid;
            console.log('使用存储的账号数据登录成功');
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