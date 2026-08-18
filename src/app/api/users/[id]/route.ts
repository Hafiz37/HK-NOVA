import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { fullName, email, role, password } = body;

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    const before = {
      fullName: existingUser.fullName,
      email: existingUser.email,
      role: existingUser.role,
    };

    // Cegah admin lockout: admin tidak boleh menurunkan role dirinya sendiri,
    // dan role ADMIN terakhir tidak boleh dicabut.
    if (role !== undefined && role !== existingUser.role) {
      const newRole = role as UserRole;
      if (id === auth.user.id && existingUser.role === 'ADMIN' && newRole !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Tidak dapat menurunkan role akun sendiri' },
          { status: 400 }
        );
      }
      if (existingUser.role === 'ADMIN' && newRole !== 'ADMIN') {
        const otherAdmins = await prisma.user.count({
          where: { role: 'ADMIN', id: { not: id } },
        });
        if (otherAdmins === 0) {
          return NextResponse.json(
            { error: 'Tidak dapat menghapus role ADMIN terakhir' },
            { status: 400 }
          );
        }
      }
    }

    const dataToUpdate: Record<string, unknown> = {};

    if (fullName !== undefined) dataToUpdate.fullName = fullName ? fullName.trim() : null;
    if (email !== undefined) {
      if (email && email.trim() !== existingUser.email) {
        const existingEmail = await prisma.user.findUnique({
          where: { email: email.trim() },
        });
        if (existingEmail) {
          return NextResponse.json({ error: 'Email sudah digunakan' }, { status: 409 });
        }
      }
      dataToUpdate.email = email ? email.trim() : null;
    }
    if (role !== undefined && Object.values(UserRole).includes(role as UserRole)) {
      dataToUpdate.role = role as UserRole;
    }
    if (password && typeof password === 'string' && password.length >= 6) {
      dataToUpdate.passwordHash = await bcrypt.hash(password, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        updatedAt: true,
      },
    });

    const fieldsChanged: string[] = [];
    if (fullName !== undefined && before.fullName !== updatedUser.fullName) fieldsChanged.push('fullName');
    if (email !== undefined && before.email !== updatedUser.email) fieldsChanged.push('email');
    if (role !== undefined && before.role !== updatedUser.role) fieldsChanged.push('role');
    if (password) fieldsChanged.push('password');

    await logAudit({
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
        after: {
          fullName: updatedUser.fullName,
          email: updatedUser.email,
          role: updatedUser.role,
          passwordReset: Boolean(password),
        },
        fieldsChanged,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: updatedUser, message: 'User berhasil diperbarui' });
  } catch (error) {
    console.error('[API /api/users/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    if (id === auth.user.id) {
      return NextResponse.json(
        { error: 'Tidak dapat menghapus akun Anda sendiri yang sedang digunakan' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    const before = {
      username: existingUser.username,
      fullName: existingUser.fullName,
      email: existingUser.email,
      role: existingUser.role,
    };

    await prisma.user.delete({
      where: { id },
    });

    await logAudit({
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ message: `User ${existingUser.username} berhasil dihapus` });
  } catch (error) {
    console.error('[API /api/users/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Gagal menghapus user' }, { status: 500 });
  }
}