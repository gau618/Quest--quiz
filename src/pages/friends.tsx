import React from 'react'
import { FriendSearch } from '@/components/social/friends/FriendSearch'
import { FriendRequestsList } from '@/components/social/friends/FriendRequestsList'
import { FriendsList } from '@/components/social/friends/FriendsList'
export default function Friends() {
  return (
<>
<FriendSearch/>
<FriendRequestsList/>
<FriendsList/>
</>
  );
}
