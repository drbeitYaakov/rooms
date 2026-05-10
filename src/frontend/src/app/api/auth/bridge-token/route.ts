import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.email || !session.user.role) {
      return NextResponse.json(
        { success: false, error: 'נדרש אימות משתמש' },
        { status: 401 }
      );
    }

    const sharedSecret = process.env.BRIDGE_TOKEN_SHARED_SECRET || process.env.NEXTAUTH_SECRET;
    console.error('Bridge token route request context:', {
      hasSessionUserId: Boolean(session.user.id),
      email: session.user.email,
      role: session.user.role,
      hasBridgeSecret: Boolean(sharedSecret),
      bridgeSecretLength: sharedSecret?.length ?? 0,
    });

    if (!sharedSecret) {
      return NextResponse.json(
        { success: false, error: 'Bridge token integration is not configured on Vercel' },
        { status: 500 }
      );
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://rooms-ma9h.onrender.com'}/api/auth/bridge-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token-Secret': sharedSecret,
      },
      body: JSON.stringify({
        id: session.user.id,
        email: session.user.email,
        role: session.user.role
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bridge token backend error response:', {
        status: response.status,
        body: errorText
      });

      let errorMessage = 'Bridge token creation failed';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Bridge token error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal bridge token route error' },
      { status: 500 }
    );
  }
}
