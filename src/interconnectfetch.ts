import { prompt } from "./tsimports";

export class fetch{
    private interconnecter: any;

    constructor(interconnecter){
        this.interconnecter = interconnecter
    }

    async fetch(params: any){
        var result = JSON.parse(await this.interconnecter.sendMessage(JSON.stringify({
            msgtype: "FETCH",
            message: JSON.stringify(params)
        })))
        if(params.responseType === "json"){
            result.data = JSON.parse(result.data)
        }

        return {
            data: result
        };
    }
}