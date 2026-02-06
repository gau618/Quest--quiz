// src/lib/services/friends.service.ts

import prisma from '@/lib/prisma/client'; // Your shared Prisma client instance
import { FriendRequestStatus } from '@prisma/client';
import { notificationService } from '@/lib/services/notification/notification.service';


export const friendsService = {
  /**
   * Searches for users by their username or name, excluding the current user.
   * This is used for the "Add Friend" search functionality.
   * @param query The search string.
   * @param currentUserId The ID of the user performing the search, to exclude them from results.
   * @returns A list of user profiles matching the query.
   */
  async searchUsers(query: string, currentUserId: string) {
    if (!query || query.length < 2) {
      return [];
    }
    return prisma.userProfile.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
            ],
          },
          { userId: { not: currentUserId } },
        ],
      },
      select: { userId: true, username: true, name: true, avatarUrl: true },
      take: 10,
    });
  },

  /**
   * Sends a new friend request from one user to another.
   * Validates that a request isn't sent to oneself, or if a friendship or pending request already exists.
   * @param requesterId The ID of the user sending the request.
   * @param receiverId The ID of the user receiving the request.
   * @returns The newly created friend request.
   */
async sendFriendRequest(requesterId: string, receiverId: string) {
  if (requesterId === receiverId) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  // Check both users exist in UserProfile
  const requesterProfile = await prisma.userProfile.findUnique({
    where: { userId: requesterId },
  });
  const receiverProfile = await prisma.userProfile.findUnique({
    where: { userId: receiverId },
  });

  if (!requesterProfile || !receiverProfile) {
    throw new Error("One or both users do not exist in UserProfile.");
  }

  // Already friends?
  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { user1Id: requesterId, user2Id: receiverId },
        { user1Id: receiverId, user2Id: requesterId },
      ],
    },
  });
  if (existingFriendship) {
    throw new Error("You are already friends with this user.");
  }

  // Request already sent?
  const existingRequest = await prisma.friendRequest.findFirst({
    where: {
      requesterId,
      receiverId,
    },
  });
  if (existingRequest && existingRequest.status === 'PENDING') {
    throw new Error("A friend request has already been sent to this user.");
  }

  // ✅ Safe to upsert
  const newRequest = await prisma.friendRequest.upsert({
    where: { requesterId_receiverId: { requesterId, receiverId } },
    update: { status: FriendRequestStatus.PENDING },
    create: {
      requesterId,
      receiverId,
      status: FriendRequestStatus.PENDING,
    },
  });

  if (requesterProfile) {
    await notificationService.sendToUsers(receiverId, 'friend_request:new', {
      id: newRequest.id,
      requester: {
        userId: requesterId,
        username: requesterProfile.username,
        avatarUrl: requesterProfile.avatarUrl,
      },
    });
  }

  return newRequest;
}

,
  /**
   * Responds to a pending friend request (accept or decline).
   * Ensures the user responding is the intended receiver of the request.
   * @param currentUserId The ID of the user responding.
   * @param requestId The ID of the friend request.
   * @param action The response action ('accept' or 'decline').
   * @returns The updated friend request.
   */
  async respondToFriendRequest(currentUserId: string, requestId: string, action: 'accept' | 'decline') {
    const request = await prisma.friendRequest.findFirst({
      where: { id: requestId, receiverId: currentUserId, status: 'PENDING' },
    });

    if (!request) {
      throw new Error("Friend request not found or you don't have permission to respond.");
    }

    if (action === 'accept') {
      return prisma.$transaction(async (tx) => {
        const updatedRequest = await tx.friendRequest.update({
          where: { id: requestId },
          data: { status: FriendRequestStatus.ACCEPTED },
        });

        const user1Id = request.requesterId < request.receiverId ? request.requesterId : request.receiverId;
        const user2Id = request.requesterId > request.receiverId ? request.requesterId : request.receiverId;

        await tx.friendship.create({
          data: { user1Id, user2Id },
        });

        // Fetch profiles and send notifications
        const requesterProfile = await tx.userProfile.findUnique({ where: { userId: request.requesterId } });
        const receiverProfile = await tx.userProfile.findUnique({ where: { userId: request.receiverId } });

        if (requesterProfile && receiverProfile) {
          // Notify requester (they know they sent it, but now it's accepted)
          await notificationService.sendToUsers(request.requesterId, 'friend:new', {
            newFriend: {
              userId: receiverProfile.userId,
              username: receiverProfile.username,
              avatarUrl: receiverProfile.avatarUrl,
            }
          });
          await notificationService.sendToUsers(request.requesterId, 'friend_request:accepted', {
             from: { userId: currentUserId }
          })

          // Notify receiver (current user - to update their list in other tabs)
          await notificationService.sendToUsers(request.receiverId, 'friend:new', {
            newFriend: {
              userId: requesterProfile.userId,
              username: requesterProfile.username,
              avatarUrl: requesterProfile.avatarUrl,
            }
          });
        }

        return updatedRequest;
      });
    } else { // 'decline' action
      const updatedRequest = await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.DECLINED },
      });
      
      // No notification for decline to comply with whitelist

      return updatedRequest;
    }
  },

  /**
   * Retrieves a user's complete list of friends.
   * @param userId The ID of the user whose friends to fetch.
   * @returns A list of friend user profiles.
   */
  async getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: {
        user1: { select: { userId: true, username: true, name: true, avatarUrl: true } },
        user2: { select: { userId: true, username: true, name: true, avatarUrl: true } },
      },
    });
    return friendships.map(f => (f.user1Id === userId ? f.user2 : f.user1));
  },

  /**
   * Retrieves a user's pending incoming friend requests.
   * @param userId The ID of the user.
   * @returns A list of pending friend requests.
   */
  async getPendingRequests(userId: string) {
    return prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: {
        requester: { select: { userId: true, username: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Removes a friend by deleting the friendship record.
   * @param currentUserId The ID of the user initiating the removal.
   * @param friendIdToRemove The ID of the friend to remove.
   */
  async removeFriend(currentUserId: string, friendIdToRemove: string) {
    const user1Id = currentUserId < friendIdToRemove ? currentUserId : friendIdToRemove;
    const user2Id = currentUserId > friendIdToRemove ? currentUserId : friendIdToRemove;

    return prisma.$transaction(async (tx) => {
      const deletedFriendship = await tx.friendship.deleteMany({
        where: { user1Id, user2Id },
      });

      if (deletedFriendship.count === 0) {
        throw new Error("Friendship not found.");
      }

      await tx.friendRequest.updateMany({
        where: {
          OR: [
            { requesterId: currentUserId, receiverId: friendIdToRemove, status: 'ACCEPTED' },
            { requesterId: friendIdToRemove, receiverId: currentUserId, status: 'ACCEPTED' },
          ],
        },
        data: { status: FriendRequestStatus.DECLINED },
      });

      await notificationService.sendToUsers(friendIdToRemove, 'friend:removed', {
        removedFriendId: currentUserId
      });
      
      // Also notify the remover so their UI syncs if they used a different device
       await notificationService.sendToUsers(currentUserId, 'friend:removed', {
        removedFriendId: friendIdToRemove
      });
    });
  },
};
