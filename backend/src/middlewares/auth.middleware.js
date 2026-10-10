import { getAuth, clerkClient } from '@clerk/express';
import User from '../models/user.model.js';

export const protectRoute = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let user = await User.findOne({ clerkId: auth.userId });

    if (!user) {
      // Fallback: If user not yet synced via webhook, fetch from Clerk API
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress || '';
      const fullName =
        [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
        clerkUser?.username ||
        email.split('@')[0] ||
        'User';

      user = await User.create({
        clerkId: auth.userId,
        email,
        fullName,
        profilePic: clerkUser?.imageUrl || '',
      });
    }
    req.auth = auth;
    req.user = user;
    next();
  } catch (error) {
    console.error('Error in protectRoute:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
