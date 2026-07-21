/**
 * 研究ラボ: ルール候補API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { 
  getRuleCandidates,
  approveRuleCandidate,
  rejectRuleCandidate,
  deleteRuleCandidate
} from '@/lib/services/rule-candidate-service';

/**
 * GET: ルール候補一覧取得
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;
    
    const candidates = await getRuleCandidates(
      session.user.id,
      status || undefined
    );
    
    return NextResponse.json({
      success: true,
      candidates
    });
  } catch (error) {
    console.error('[Rule Candidates API] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rule candidates' },
      { status: 500 }
    );
  }
}

/**
 * PATCH: ルール候補のステータス更新
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { id, action } = await req.json();
    
    if (!id || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    switch (action) {
      case 'approve':
        await approveRuleCandidate(id, session.user.id);
        break;
      case 'reject':
        await rejectRuleCandidate(id, session.user.id);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    return NextResponse.json({
      success: true,
      message: `Rule candidate ${action}d successfully`
    });
  } catch (error) {
    console.error('[Rule Candidates API] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update rule candidate' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: ルール候補削除
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing id parameter' },
        { status: 400 }
      );
    }
    
    await deleteRuleCandidate(id, session.user.id);
    
    return NextResponse.json({
      success: true,
      message: 'Rule candidate deleted successfully'
    });
  } catch (error) {
    console.error('[Rule Candidates API] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete rule candidate' },
      { status: 500 }
    );
  }
}
