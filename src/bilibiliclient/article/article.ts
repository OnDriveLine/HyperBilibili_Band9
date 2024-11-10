export const BilibiliClientArticleMethods = {
    // 获取专栏网页HTML（需要过parser才能使用）
    async getArticle(this: any, cvid: string): Promise<any> {
        const url = `https://www.bilibili.com/read/${cvid}`;
        const response = await this.getRequest(url, "text");

        return response.data;
    }
}