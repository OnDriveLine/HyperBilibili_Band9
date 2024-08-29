import { device } from "./tsimports"

export function formatNumber(num: number): string {
    console.log("formatNumber: " + num)
    if (num < 1000) {
        return num.toString();
    }
    else if (num < 10000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    else {
        return (num / 10000).toFixed(1) + 'w'
    }
}

export function getCurrentTime(): string {
    const now: Date = new Date();

    let hours: number = now.getHours();
    let minutes: number = now.getMinutes();

    const formattedHours: string = hours < 10 ? '0' + hours : hours.toString();
    const formattedMinutes: string = minutes < 10 ? '0' + minutes : minutes.toString();

    const timeString: string = `${formattedHours}:${formattedMinutes}`;

    return timeString;
}

export function getDeviceInformation(): Promise<any> {
    return new Promise((resolve, reject) => {
        device.getInfo({
            success: (data) => {
                resolve(data);
            },
            fail: (error) => {
                reject(error);
            }
        });
    });
}

export function unicodeToString(unicodeStr) {
    return unicodeStr.replace(/\\u([\dA-F]{4})/gi, function (match, grp) {
        return String.fromCharCode(parseInt(grp, 16));
    });
}