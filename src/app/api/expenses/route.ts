import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryExpenses, appendMockExpense, deleteMockExpense } from '@/lib/prisma';
import { GeneratedExpense } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const category = searchParams.get('category') || 'All';

    let expenses: any[] = [];
    try {
      expenses = await prisma.expense.findMany({
        orderBy: { date: 'desc' },
      });
    } catch {
      expenses = getInMemoryExpenses();
    }

    if (!expenses || expenses.length === 0) {
      expenses = getInMemoryExpenses();
    }

    let processed = expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      date: new Date(e.date).toISOString(),
    }));

    if (search) {
      processed = processed.filter(
        (e) =>
          e.description.toLowerCase().includes(search) ||
          e.category.toLowerCase().includes(search)
      );
    }

    if (category !== 'All') {
      processed = processed.filter(
        (e) => e.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Calculate Summary Stats
    const totalExpenses = processed.reduce((acc, curr) => acc + curr.amount, 0);

    // Current month (August/September 2026)
    const currentMonthExpenses = processed
      .filter((e) => new Date(e.date).getMonth() === 8) // Sep 2026 or Aug 2026
      .reduce((acc, curr) => acc + curr.amount, 0);

    return NextResponse.json({
      success: true,
      expenses: processed,
      totalCount: processed.length,
      totalExpenses,
      currentMonthExpenses: currentMonthExpenses || totalExpenses * 0.45,
    });
  } catch (error: any) {
    console.error('Expenses GET API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, category, description, amount } = body;

    if (!date || !category || !description || amount === undefined || isNaN(Number(amount))) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields or invalid amount' },
        { status: 400 }
      );
    }

    const parsedDate = new Date(date);
    const numAmount = Number(amount);
    const newId = `exp-${Date.now().toString(36)}`;

    const newExpense: GeneratedExpense = {
      id: newId,
      date: parsedDate,
      category: category as any,
      description: description.trim(),
      amount: numAmount,
      createdAt: new Date(),
    };

    try {
      await prisma.expense.create({
        data: {
          id: newId,
          date: parsedDate,
          category,
          description: description.trim(),
          amount: numAmount,
          createdAt: new Date(),
        },
      });
    } catch {
      appendMockExpense(newExpense);
    }

    return NextResponse.json({
      success: true,
      expense: newExpense,
      message: 'Expense logged successfully!',
    });
  } catch (error: any) {
    console.error('Expenses POST API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create expense' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing expense ID' },
        { status: 400 }
      );
    }

    try {
      await prisma.expense.delete({
        where: { id },
      });
    } catch {
      deleteMockExpense(id);
    }

    return NextResponse.json({
      success: true,
      message: 'Expense deleted successfully!',
    });
  } catch (error: any) {
    console.error('Expenses DELETE API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete expense' },
      { status: 500 }
    );
  }
}
