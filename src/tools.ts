export function formatNumber(num: number): string{
    if(num < 1000){
        return num.toString();
    }
    else if(num < 10000){
        return (num/1000).toFixed(1) + 'k';
    }
    else{
        return (num / 10000).toFixed(1) + 'w'
    }
}