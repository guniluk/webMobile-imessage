export const checkAuth = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return res.status(200).json({ message: 'Authorized', user });
  } catch (error) {
    console.error('Error in checkAuth:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
