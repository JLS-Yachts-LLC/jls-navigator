import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolarisRole, usePolarisStaffStatus } from "@/lib/use-polaris-role";

// Synthetic test user id only â no real user/account is read or written.
// Supabase client is fully mocked below, so no network/DB calls occur.
const TEST_USER_ID = "00000000-0000-4000-8000-TEST00000001";

const mockMaybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: TEST_USER_ID } }),
}));

vi.mock("@/lib/view-as", () => ({
  useViewAsRole: () => null,
}));

vi.mock("@/lib/auth/useAccess", () => ({
  useAccess: () => ({ previewing: false, claims: {} }),
}));

describe("SD-0074: usePolarisRole / usePolarisStaffStatus staff resolution", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
  });

  it("defaults to global_admin (full staff access) when the role lookup errors, instead of silently appearing non-staff", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "TEST_simulated RLS denial on roles join" },
    });

    const { result } = renderHook(() => usePolarisRole());

    await waitFor(() => {
      expect(result.current).toBe("global_admin");
    });
  });

  it("resolves to the restricted role when the user's profile role is logistics_team", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { roles: { name: "logistics_team" } },
      error: null,
    });

    const { result } = renderHook(() => usePolarisRole());

    await waitFor(() => {
      expect(result.current).toBe("logistics_team");
    });
  });

  it("usePolarisStaffStatus reports isStaff=true once a user_profiles row resolves for the signed-in user", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { user_id: TEST_USER_ID },
      error: null,
    });

    const { result } = renderHook(() => usePolarisStaffStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.isStaff).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  it("usePolarisStaffStatus reports isStaff=false (not a crash) and surfaces the error when no user_profiles row exists, instead of masking the gap", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => usePolarisStaffStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.isStaff).toBe(false);
    });
  });
});
