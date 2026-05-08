CREATE OR REPLACE FUNCTION public.get_friend_equipped_items(p_friend_id UUID)
RETURNS TABLE (
  item_id UUID,
  name TEXT,
  category TEXT,
  rarity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_friend_id IS NULL THEN
    RAISE EXCEPTION 'Friend id is required';
  END IF;

  IF p_friend_id <> v_uid AND NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = v_uid AND f.friend_id = p_friend_id)
        OR (f.friend_id = v_uid AND f.user_id = p_friend_id)
      )
  ) THEN
    RAISE EXCEPTION 'User is not your friend';
  END IF;

  RETURN QUERY
  SELECT
    ui.item_id,
    si.name,
    si.category,
    si.rarity
  FROM public.user_items ui
  INNER JOIN public.shop_items si ON si.id = ui.item_id
  WHERE ui.user_id = p_friend_id
    AND ui.equipped = true
    AND ui.quantity > 0
  ORDER BY si.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_friend_equipped_items(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_equipped_items(UUID) TO authenticated;
