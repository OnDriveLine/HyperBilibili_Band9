export const BilibiliClientUserMethods = {
    // 根据UID批量获取用户信息
    async getMultiUserInfoByUID(this: any, uids: Array<String>) {
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
}