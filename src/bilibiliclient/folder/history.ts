export const BilibiliClientHistoryMethods = {
    // 获取历史记录
    async getWatchHistory(this: any, pn: number, ps: number): Promise<any> {
        const url = `https://api.bilibili.com/x/v2/history?pn=${pn}&ps=${ps}`;
        const response = await this.getRequest(url);
        return response.data.data;
    }
}