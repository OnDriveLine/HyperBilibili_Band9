import { storage, router, network } from './tsimports';

export async function Jump() {
    storage.get({
        key: "bilibili_account",
        success: async (bilibili_account) => {
            if (bilibili_account.length < 1) {
                router.replace({
                    uri: "pages/login"
                })
            } else {
                router.replace({
                    uri: "pages/prepage"
                })
            }
        }
    })
}

export async function GoOpenInterconnectPage() {
    router.replace({
        uri: "pages/interconnectguider"
    })
}

export async function NetworkCheck(): Promise<boolean> {
    return new Promise((resolve) => {
        network.getType({
            success: function (data: { type: string }) {
                if (!data.type) {
                    console.log('Network type is empty or undefined.');
                    GoOpenInterconnectPage()
                    resolve(false);
                } else if (data.type === 'none') {
                    resolve(false);
                } else {
                    resolve(true);
                }
            },
            fail: function () {
                // 发生错误（如权限不足等），可以在这里处理错误逻辑
                // 这里留空，供你实现具体逻辑
                console.log('Failed to get network type.');
                GoOpenInterconnectPage()
                resolve(false);
            },
            complete: function () {
                console.log('Network type check completed.');
            }
        });
    });
}