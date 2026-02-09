import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { emailConfig } from '~/config/email'
import { db } from '~/db'
import { type GuestbookDto, GuestbookHashids } from '~/db/dto/guestbook.dto'
import { fetchGuestbookMessages } from '~/db/queries/guestbook'
import { guestbook } from '~/db/schema'
import NewGuestbookEmail from '~/emails/NewGuestbook'
import { env } from '~/env.mjs'
import { url } from '~/lib'
import { getIP } from '~/lib/ip'
import { resend } from '~/lib/mail'
import { ratelimit } from '~/lib/redis'

function getKey(id?: string) {
  return `guestbook${id ? `:${id}` : ''}`
}

export async function GET(req: NextRequest) {
  try {
    const { success } = await ratelimit.limit(getKey(getIP(req)))
    if (!success) {
      return new Response('Too Many Requests', {
        status: 429,
      })
    }

    return NextResponse.json(await fetchGuestbookMessages())
  } catch (error) {
    return NextResponse.json({ error }, { status: 400 })
  }
}

const SignGuestbookSchema = z.object({
  message: z.string().min(1).max(600),
})

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { success } = await ratelimit.limit(getKey(user.id))
  if (!success) {
    return new Response('Too Many Requests', {
      status: 429,
    })
  }

  try {
    const data = await req.json()
    const { message } = SignGuestbookSchema.parse(data)

    const guestbookData = {
      userId: user.id,
      message,
      userInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
      },
    }

    // 解析 @ 提及的用户
    const mentionedUsernames = extractMentions(message)
    const emailsToNotify: string[] = []
    
    // 发送邮件通知
    if (env.RESEND_API_KEY) {
      // 获取所有留言墙消息以找到对应的用户
      if (mentionedUsernames.length > 0) {
        const messages = await fetchGuestbookMessages()
        const mentionedUserIds = new Set<string>()
        
        // 匹配用户名找到用户ID
        for (const msg of messages) {
          if (msg.userInfo) {
            const fullName = `${msg.userInfo.firstName || ''} ${msg.userInfo.lastName || ''}`.trim()
            if (mentionedUsernames.some(username => fullName.includes(username))) {
              mentionedUserIds.add(msg.userId)
            }
          }
        }
        
        // 获取被提及用户的邮箱
        for (const userId of mentionedUserIds) {
          try {
            const clerk = await clerkClient()
            const clerkUser = await clerk.users.getUser(userId)
            const email = clerkUser.emailAddresses[0]?.emailAddress
            if (email) {
              emailsToNotify.push(email)
            }
          } catch (error) {
            console.error(`Failed to get email for user ${userId}:`, error)
          }
        }
      }
      
      // 如果没有提及任何人，或者管理员不在被提及列表中，通知管理员
      const adminEmail = env.SITE_NOTIFICATION_EMAIL_TO
      if (adminEmail && !emailsToNotify.includes(adminEmail)) {
        emailsToNotify.push(adminEmail)
      }
      
      // 发送邮件通知
      if (emailsToNotify.length > 0) {
        await Promise.all(
          emailsToNotify.map(email =>
            resend.emails.send({
              from: emailConfig.from,
              to: email,
              subject: email === adminEmail ? '👋 有人刚刚在留言墙留言了' : '👋 有人在留言墙提到了你',
              react: NewGuestbookEmail({
                link: url(`/guestbook`).href,
                userFirstName: user.firstName,
                userLastName: user.lastName,
                userImageUrl: user.imageUrl,
                commentContent: message,
              }),
            })
          )
        )
      }
    }

    const [newGuestbook] = await db
      .insert(guestbook)
      .values(guestbookData)
      .returning({
        newId: guestbook.id,
      })

    return NextResponse.json(
      {
        ...guestbookData,
        id: GuestbookHashids.encode(newGuestbook.newId),
        createdAt: new Date(),
      } satisfies GuestbookDto,
      {
        status: 201,
      }
    )
  } catch (error) {
    return NextResponse.json({ error }, { status: 400 })
  }
}

// 提取消息中的 @ 提及（忽略 Markdown 链接中的 @）
function extractMentions(message: string): string[] {
  const mentions: string[] = []
  
  // 使用同样的逻辑：只处理不在 Markdown 链接中的 @ 提及
  message.replace(
    /(?<!\]\(.*?)@([^\s\]]+)(?!\]\()/g,
    (match, username) => {
      // 额外检查：如果这个 @ 在方括号内，说明可能是 Markdown 链接的一部分
      const beforeAt = message.substring(0, message.indexOf(match))
      const openBrackets = (beforeAt.match(/\[/g) || []).length
      const closeBrackets = (beforeAt.match(/\]/g) || []).length
      
      // 如果方括号不匹配，说明我们在一个未关闭的方括号内，跳过
      if (openBrackets <= closeBrackets) {
        mentions.push(username)
      }
      
      return match
    }
  )
  
  return mentions
}
