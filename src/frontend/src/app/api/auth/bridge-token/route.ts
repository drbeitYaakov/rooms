import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.email || !session.user.role) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const sharedSecret = process.env.BRIDGE_TOKEN_SHARED_SECRET || process.env.NEXTAUTH_SECRET;
    if (!sharedSecret) {
      return NextResponse.json(
        { success: false, error: 'Bridge token integration is not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/bridge-token`, {
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
      const errorData = await response.json();
      return NextResponse.json(
        { success: false, error: errorData.error || 'Failed to create bridge token' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Bridge token error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
