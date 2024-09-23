import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import rooms from './room.json' 
import { error } from 'console'

export const name = 'fjut-power-today'

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

export const inject = ['puppeteer']

async function get_power(ctx: Context, room_val, floor: string, room: string){
    try {
        let room_info = get_floor_room_id(room_val, floor, room)
        if (typeof room_info == 'string') 
            {
                return room_info
            }
        const url = `https://hqwx.fjut.edu.cn/agent/app/index.php?i=67&c=entry&op=getelec&do=rechargeelec&m=maihu_yktservice&mh_skipLoading=1&room_id%5B%5D=changgong*1&room_id%5B%5D=${room_info.floor_id}&room_id%5B%5D=${room_info.room_id}`
        const page = await ctx.puppeteer.browser.newPage()
        await page.goto(url, { waitUntil: 'networkidle0' })
        const content = await page.$eval('body', body => body.innerHTML)
        await page.close()
        return content
    } catch (error) {
        return 'wrong'
    }
}

function get_floor_room_id(room_val, floor: string, room: string){
    try {
        let floor_id: number, room_id: number;
        let floor_info = room_val.yd_roominfo[0].subMenus
        for (let i = 0; i < floor_info.length; i++)
            {
                if (floor_info[i].name == floor)
                    {
                        floor_id = floor_info[i].id
                        let room_info = floor_info[i].subMenus;
                        for (let j = 0; j < room_info.length; j++)
                            {
                                if (room_info[j].name == room)
                                    {
                                        room_id = room_info[j].id
                                        return {floor_id: floor_id, room_id: room_id}
                                    }
                            }
                    }
            }
        throw new Error('找不到这间宿舍')
    } catch (error) {
        return error.message
    }
}

async function get_last_day_use(ctx: Context, room_val, floor, room){
    try {
        let room_info = get_floor_room_id(room_val, floor, room)
        if (typeof room_info == 'string') 
            {
                return room_info
            }
        const url = `https://hqwx.fjut.edu.cn/agent/app/index.php?i=67&c=entry&op=getelecday&do=rechargeelec&m=maihu_yktservice&mh_skipLoading=1&room_id%5B%5D=changgong*1&room_id%5B%5D=${room_info.floor_id}&room_id%5B%5D=${room_info.room_id}`
        const page = await ctx.puppeteer.browser.newPage()
        await page.goto(url, { waitUntil: 'networkidle0' })
        const content = await page.$eval('body', body => body.innerHTML)
        await page.close()
        return content
    } catch (error) {
        return 'wrong'
    }
}

async function format_power(ctx: Context, room_val, floor: string, room: string) {
    let today_have;
    let last_day_use;
    do {
        if (today_have == 'wrong' || today_have == null) today_have = await get_power(ctx, room_val, floor, room)
        if (last_day_use == 'wrong' || last_day_use == null) last_day_use = await get_last_day_use(ctx, room_val, floor, room)
    } while (today_have == "wrong" || last_day_use == 'wrong')

    today_have = today_have.replace(/\\u([\d\w]{4})/gi, (_, match) => 
    String.fromCharCode(parseInt(match, 16))
    );
    last_day_use = last_day_use.replace(/\\u([\d\w]{4})/gi, (_, match) => 
        String.fromCharCode(parseInt(match, 16))
        );
    try {
        today_have = JSON.parse(today_have)
        today_have = today_have.elec
    } catch (error) {
        
    }
    
    last_day_use = JSON.parse(last_day_use)
    last_day_use = last_day_use.list[0]
    return `${floor} ${room}\n${today_have}\n${last_day_use.elecdate}: 已用${last_day_use.useelec}度，花费${Math.round(last_day_use.useelec*0.533*100)/100}元`
}

export async function alert_power(ctx: Context, room_val, floor, room) {
    // 获取当前日期
    const now = new Date();
    // 创建一个新的日期对象，表示明天早上九点
    const tomorrow9am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
    // 计算时间戳差值
    const diff = tomorrow9am.getTime() - now.getTime();
    ctx.setTimeout(async () => {
        const bot = ctx.bots[`onebot:3491108692`]
        const res_list = await format_power(ctx, room_val, floor, room)
        bot.sendMessage('790332177', res_list)
    }, diff)
    ctx.timer.setTimeout(() => {
        alert_power(ctx, room_val, floor, room)
    }, diff)
}

export async function apply(ctx: Context) {

    const room_val = JSON.parse(JSON.stringify(rooms))
    // write your plugin here
    alert_power(ctx, room_val, 'C5', '204')

    ctx.command('power/today <floor> <room>', '（查询宿舍电量）使用方法：power.today C1 707')
    .action(async ({session}, floor, room) => {
        if (floor == null || room == null) return '没有写哪栋楼或者宿舍号'
        return await format_power(ctx, room_val, floor, room)
        // return format_power(ctx)
    })
    
    ctx.command('power/alert <floor <room>>', '（开发中）（设置宿舍电量提醒，默认早上9点）使用方法：power.today C1 707')
}
