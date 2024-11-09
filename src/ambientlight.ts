import { getDeviceInformation } from "./tools";

class AmbientLightRunner {
    ambientlight: any;
    intervalId: NodeJS.Timeout | null;
    rotatedeg_num: number;
    settings: any;

    constructor(ambientlight: any, settings: any) {
        this.ambientlight = ambientlight;
        this.intervalId = null;
        this.rotatedeg_num = 0;
        this.settings = settings
    }

    async start() {
        const deviceinfo = await getDeviceInformation();

        const widthCenter = deviceinfo.screenWidth / 2;
        const heightCenter = deviceinfo.screenHeight / 2;

        this.ambientlight.transform_origin = `${widthCenter}px ${heightCenter}px`;

        if(this.settings.SETTINGS.enableFullAnimation){
            this.intervalId = setInterval(() => {
                this.ambientlight.rotatedeg = `${this.rotatedeg_num}deg`;
                this.rotatedeg_num += 1.5;
            }, 800);
        }
    }

    stop() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

export { AmbientLightRunner };