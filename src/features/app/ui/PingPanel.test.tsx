import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PingPanel } from "./PingPanel";
import { usePing } from "../model/usePing";

// Component 테스트는 invoke 를 직접 mock 하지 않고 hook/API layer 를 mock 한다.
// (docs/optional/server-state.md §4 — mock 경계는 hook/API layer)
vi.mock("../model/usePing");

const mockedUsePing = vi.mocked(usePing);

describe("PingPanel", () => {
  it("결과 데이터가 있으면 message·echoedNote 를 렌더한다", () => {
    mockedUsePing.mockReturnValue({
      data: { message: "pong", echoedNote: "hi" },
      isLoading: false,
      error: null,
      ping: vi.fn(),
    });

    render(<PingPanel />);

    const result = screen.getByTestId("ping-result");
    expect(result).toHaveTextContent("pong");
    expect(result).toHaveTextContent("hi");
  });

  it("로딩 중에는 호출 버튼이 비활성이다", () => {
    mockedUsePing.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      ping: vi.fn(),
    });

    render(<PingPanel />);

    expect(screen.getByTestId("ping-button")).toBeDisabled();
  });

  it("에러가 있으면 에러 메시지를 렌더한다", () => {
    mockedUsePing.mockReturnValue({
      data: null,
      isLoading: false,
      error: "연결에 실패했습니다.",
      ping: vi.fn(),
    });

    render(<PingPanel />);

    expect(screen.getByTestId("ping-error")).toHaveTextContent("연결에 실패했습니다.");
  });
});
