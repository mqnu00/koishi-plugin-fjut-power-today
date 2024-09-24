import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import rooms from './room.json' 
import { error } from 'console'

export const name = 'fjut-power-today'

export const inject = ['puppeteer', 'database']

export const usage = `



<h2>插件简介</h2>
<p><code>福建理工大学宿舍电费提醒插件</code></p>

<h2>使用提示</h2>
<p><code>today (floor) (room): 查询宿舍当天电量 </code></p>
<p><code>alert (floor) (room): 设置宿舍电量定时提醒（默认每天早上9点）</code></p>
<p><code>undo: 取消定时提醒</code></p>

`;

declare module 'koishi' {
    interface Tables {
        fjut_power_today: {
            id: number
            group_id: string
            self_id: string
            self_platform: string
            floor: string
            room: string
        }
    }
}

export interface Config {

    alertTimerRestore: boolean
}

export const Config: Schema<Config> = Schema.object({

    alertTimerRestore: Schema
    .boolean()
    .default(false)
    .description('为true，则插件重启后向宿舍群发布恢复定时提醒的通知')
})

// 获取当日宿舍剩余电量
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

// 将楼号和宿舍号转换成id
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

// 获取昨日使用的电量
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

// 将获取到的今天剩余电量和昨天的用电量整理成string
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

// 定时
export async function alert_power(ctx: Context, group_id, self_id, self_platform, room_val, floor, room) {
    // 获取当前日期
    const now = new Date();
    // 创建一个新的日期对象，表示明天早上九点
    const tomorrow9am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
    // 计算时间戳差值
    const diff = tomorrow9am.getTime() - now.getTime();
    ctx.setTimeout(async () => {
        const bot = ctx.bots[`${self_platform}:${self_id}`]
        const res_list = await format_power(ctx, room_val, floor, room)
        bot.sendMessage(group_id, res_list)
    }, diff)
    return ctx.setTimeout(() => {
        alert_power(ctx, room_val, group_id, self_id, self_platform, floor, room)
    }, diff)
}

export async function apply(ctx: Context, config: Config) {

    ctx.database.extend('fjut_power_today', {
        id: 'unsigned',
        group_id: 'string',
        self_id: 'string',
        self_platform: 'string',
        floor: 'string',
        room: 'string'
    })

    const room_val = JSON.parse(JSON.stringify(rooms))

    let timer_callback: { [key: string]: () => void } = {}

    ctx.on('ready', async () => {

        const result = await ctx.database.get('fjut_power_today', {})
        for (let i = 0; i < result.length; i++) {
            let callback = await alert_power(
                ctx,
                result[i].group_id,
                result[i].self_id,
                result[i].self_platform,
                room_val,
                result[i].floor,
                result[i].room
            )
            const bot = ctx.bots[`${result[i].self_platform}:${result[i].self_id}`]
            timer_callback[result[i].group_id] = callback
            if (config.alertTimerRestore) {
                bot.sendMessage(result[i].group_id, '机器人重启，不用担心，你的定时提醒已恢复')
            }
        }
    })
    // write your plugin here

    ctx.command('power/today <floor> <room>', '（查询宿舍电量）使用方法：power.today C1 707')
    .action(async ({session}, floor, room) => {
        if (floor == null || room == null) return '没有写哪栋楼或者宿舍号'
        return await format_power(ctx, room_val, floor, room)
        // return format_power(ctx)
    })
    
    ctx.command('power/alert <floor> <room>', '（设置宿舍电量提醒，默认早上9点）使用方法：power.today C1 707')
    .action(async ({session}, floor, room) => {

        if (!session.guildId) {
            return '这条命令只能在群聊使用'
        }

        const roles = session.author.roles
        console.log(roles)
        if (roles.includes('member')) return '群管理员或群主能执行这条指令' 
        if (floor == null || room == null) return '没有写哪栋楼或者宿舍号'
        let self_id = session.selfId
        let self_platform = session.platform
        let group_id = session.guildId
        await ctx.database.remove('fjut_power_today', {group_id: group_id})
        const result = await ctx.database.create('fjut_power_today', {
            id: null,
            group_id: group_id,
            self_id: self_id,
            self_platform: self_platform,
            floor: floor,
            room: room
        })
        if (result) {
            let callback = await alert_power(ctx, room_val, group_id, self_id, self_platform, floor, room)
            timer_callback[group_id] = callback
            return '定时成功，以后每天早上9点提醒宿舍电费信息'
        } else {
            return '出现BUG，请反馈给 qq 647983952'
        }
    })

    ctx.command('power/undo', '取消定时提醒')
    .action(async ({session}, floor, room) => {

        if (!session.guildId) {
            return '这条命令只能在群聊使用'
        }

        const roles = session.author.roles
        if (roles.includes('member')) return '群管理员或群主能执行这条指令' 
        await ctx.database.remove('fjut_power_today', {group_id: session.guildId})
        if (timer_callback[session.guildId]) {
            await timer_callback[session.guildId]()
            delete timer_callback[session.guildId]
            return '已取消定时'
        } else {
            return '你没有设置定时'
        }
    })
}
