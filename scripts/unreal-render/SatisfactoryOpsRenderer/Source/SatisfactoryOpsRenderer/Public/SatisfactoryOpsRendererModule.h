#pragma once

#include "CoreMinimal.h"
#include "Containers/Ticker.h"
#include "Modules/ModuleManager.h"

class FDelegateHandle;
class UWorld;

class FSatisfactoryOpsRendererModule final : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

private:
    void HandlePostWorldInitialization(UWorld* World, const UWorld::InitializationValues InitializationValues);
    bool TryStartRenderer(float DeltaTime);

    FDelegateHandle PostWorldInitializationHandle;
    FTSTicker::FDelegateHandle StartupTickerHandle;
    TWeakObjectPtr<UWorld> PendingWorld;
    bool bStarted = false;
};
